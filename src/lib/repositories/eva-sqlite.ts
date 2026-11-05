import type { DatabaseSync } from "node:sqlite";
import { evaJobFromRow, type EvaStore, type EvaJob, type EvaResult, type EvaSettings, type EvaUsage } from "../eva.ts";
import { ConflictError } from "../errors.ts";

export function createSqliteEvaStore(db: DatabaseSync): EvaStore {
  db.exec(`CREATE TABLE IF NOT EXISTS eva_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, pricing TEXT);
    INSERT OR IGNORE INTO eva_settings(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS eva_jobs (id TEXT PRIMARY KEY, inbox_id INTEGER NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
      result TEXT, task_ids TEXT NOT NULL DEFAULT '[]', context TEXT NOT NULL DEFAULT '[]', error TEXT, lease TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS eva_jobs_recent ON eva_jobs(created_at DESC);
    CREATE TABLE IF NOT EXISTS eva_calls (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, usage TEXT, created_at TEXT NOT NULL);`);
  const get = (id: string) => { const row = db.prepare("SELECT * FROM eva_jobs WHERE id=?").get(id); return row ? evaJobFromRow(row) : null; };
  const settings = (): EvaSettings => { const row = db.prepare("SELECT * FROM eva_settings WHERE id=1").get()!; return { enabled: Boolean(row.enabled), pricing: row.pricing ? JSON.parse(String(row.pricing)) : null }; };
  const tx = <T>(fn: () => T): T => { db.exec("BEGIN IMMEDIATE"); try { const value = fn(); db.exec("COMMIT"); return value; } catch (e) { db.exec("ROLLBACK"); throw e; } };
  function apply(job: EvaJob, result: EvaResult, approved: boolean) {
    const ids = [...job.taskIds];
    result.tasks.forEach((task, index) => {
      if (ids[index] || (!approved && task.review)) return;
      const now = new Date().toISOString();
      const id = Number(db.prepare("INSERT INTO tasks(title,notes,due_date,due_time,priority,tags,created_at,updated_at) VALUES(?,?,?,?,'medium','[]',?,?)")
        .run(task.title, task.notes, task.dueDate, task.dueTime, now, now).lastInsertRowid);
      ids[index] = id;
      if (task.remind) {
        const at = new Date(`${task.dueDate}T${task.dueTime}:00+08:00`).toISOString();
        const rule = Number(db.prepare("INSERT INTO task_reminders(task_id,trigger_type,absolute_date,absolute_time,relative_to,offset_minutes,timezone,repeat_while_overdue) VALUES(?,'relative',NULL,NULL,'due',0,'Asia/Shanghai',0)").run(id).lastInsertRowid);
        const reminder = Number(db.prepare(`INSERT INTO reminders(title,target_type,target_id,source_type,source_id,schedule_type,starts_at,next_due_at,timezone,note,lead_time_minutes,repeat_while_overdue,status,is_active,due_has_explicit_time,overdue_after)
          VALUES(?,'task',?,'task_reminder',?,'one_time',?,?,'Asia/Shanghai',?,0,0,'scheduled',1,1,?)`).run(task.title, id, rule, at, at, task.notes, at).lastInsertRowid);
        db.prepare("UPDATE task_reminders SET reminder_id=? WHERE id=?").run(reminder, rule);
        db.prepare("UPDATE tasks SET reminder_id=? WHERE id=?").run(reminder, id);
      }
    });
    const review = !approved && (result.review || result.tasks.some(t => t.review));
    const status = review ? "review" : "done";
    db.prepare("UPDATE eva_jobs SET status=?,result=?,task_ids=?,error=NULL,lease=NULL,lease_until=NULL,updated_at=? WHERE id=?")
      .run(status, JSON.stringify(result), JSON.stringify(Array.from({ length: result.tasks.length }, (_, i) => ids[i] ?? 0)), new Date().toISOString(), job.id);
    if (!review && !result.remaining && ids.some(Boolean)) db.prepare("UPDATE inbox_items SET status='processed',processed_at=?,updated_at=? WHERE id=? AND status='inbox'").run(new Date().toISOString(), new Date().toISOString(), job.inboxId);
    return get(job.id)!;
  }
  return {
    async settings(patch) { return tx(() => { if (patch?.enabled !== undefined) db.prepare("UPDATE eva_settings SET enabled=? WHERE id=1").run(Number(patch.enabled)); if (patch?.pricing !== undefined) db.prepare("UPDATE eva_settings SET pricing=? WHERE id=1").run(patch.pricing ? JSON.stringify(patch.pricing) : null); return settings(); }); },
    async capture(key, content, process) { return tx(() => {
      const old = get(key); if (old) { if (old.content !== content) throw new ConflictError("这次提交已保存，请重新打开输入框。"); return old; }
      const now = new Date().toISOString();
      const inbox = Number(db.prepare("INSERT INTO inbox_items(content,source) VALUES(?,'eva-paper')").run(content).lastInsertRowid);
      db.prepare("INSERT INTO eva_jobs(id,inbox_id,content,status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(key, inbox, content, process && settings().enabled ? "queued" : "held", now, now);
      return get(key)!;
    }); },
    async list() { return db.prepare("SELECT * FROM eva_jobs ORDER BY created_at DESC LIMIT 50").all().map(evaJobFromRow); },
    async get(id) { return get(id); },
    async claim(id, lease) { return tx(() => {
      const job = get(id), now = new Date().toISOString();
      if (!settings().enabled || !job || job.attempts >= 10 || !(job.status === "queued" || job.status === "running" && job.leaseUntil! < now)) return null;
      db.prepare("UPDATE eva_jobs SET status='running',lease=?,lease_until=?,attempts=attempts+1,error=NULL,updated_at=? WHERE id=?").run(lease, new Date(Date.now() + 120000).toISOString(), now, id);
      db.prepare("INSERT INTO eva_calls(id,job_id,created_at) VALUES(?,?,?)").run(lease, id, now); return get(id)!;
    }); },
    async usage(id, usage) { db.prepare("UPDATE eva_calls SET usage=? WHERE id=?").run(JSON.stringify(usage), id); },
    async calls() { return db.prepare("SELECT * FROM eva_calls ORDER BY created_at DESC").all().map(row => ({ id: String(row.id), jobId: String(row.job_id), createdAt: String(row.created_at), ...(row.usage ? JSON.parse(String(row.usage)) as EvaUsage : { input: null, output: null, cached: null, cost: null, currency: null, model: "unknown", pricing: null, promptVersion: "unknown" }) })); },
    async finish(id, lease, result) { return tx(() => { const job = get(id); if (!job || job.status !== "running" || job.lease !== lease) throw new ConflictError("纸条处理状态已改变，请刷新。"); if (!settings().enabled) { db.prepare("UPDATE eva_jobs SET status='held',lease=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(new Date().toISOString(), id); return get(id)!; } return apply(job, result, false); }); },
    async fail(id, lease) { db.prepare("UPDATE eva_jobs SET status='failed',error='这次未能整理，原文已保留。可重试或仅留在 Inbox。',lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease=? AND status='running'").run(new Date().toISOString(), id, lease); },
    async decide(id, action, instruction) { return tx(() => {
      const job = get(id); if (!job || job.status === "done" || job.status === "running" && job.leaseUntil! > new Date().toISOString()) throw new ConflictError("纸条状态已改变，请刷新。");
      if (action === "retry" && !["held", "failed"].includes(job.status)) throw new ConflictError("请刷新后继续处理这张纸条。");
      if (action === "approve") { if (job.status !== "review" || !job.result) throw new ConflictError("没有待确认建议。"); return apply(job, job.result, true); }
      if (action === "revise" && job.taskIds.some(Boolean)) throw new ConflictError("部分任务已经创建，请直接编辑任务，或确认余下建议。");
      const context = action === "revise" ? [...job.context, instruction!].slice(-4) : job.context;
      if (action !== "keep" && !settings().enabled) throw new ConflictError("请先开启 Eva。");
      db.prepare("UPDATE eva_jobs SET status=?,context=?,lease=NULL,lease_until=NULL,error=NULL,updated_at=? WHERE id=?").run(action === "keep" ? "done" : "queued", JSON.stringify(context), new Date().toISOString(), id);
      return get(id)!;
    }); },
  };
}
