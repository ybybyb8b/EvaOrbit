import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { zonedDateParts } from "../../src/lib/time.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const receiptPath = path.join(root, "tmp", "ios-host-installation.json");
const title = "重新签名安装 EO Host";
const markerTag = "Host 续签";

export function hostRenewalSchedule(installedAt) {
  const installed = new Date(installedAt);
  if (!Number.isFinite(installed.getTime())) throw new Error("Invalid installation time");
  const remindAt = new Date(installed.getTime() + 6 * 86_400_000);
  remindAt.setUTCSeconds(0, 0);
  return { installedAt: installed.toISOString(), remindAt: remindAt.toISOString(), estimatedExpiresAt: new Date(installed.getTime() + 7 * 86_400_000).toISOString(), ...zonedDateParts(remindAt, "Asia/Shanghai") };
}

export async function updateHostRenewalReminder(sql, schedule, ownerEmail) {
  return sql.begin(async tx => {
    const owners = ownerEmail
      ? await tx`select id from auth.users where lower(email) = ${ownerEmail.toLowerCase()}`
      : await tx`select id from auth.users limit 2`;
    if (owners.length !== 1) throw new Error("Set EVAORBIT_ALLOWED_EMAIL to identify one EO account");
    const userId = owners[0].id;
    // Serialize installs without adding schema or producing duplicate reminder tasks.
    await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:eo-host-renewal`}))`;
    const existing = await tx`select id from public.tasks where user_id=${userId} and title=${title} and ${markerTag}=any(tags)`;
    if (existing.length > 1) throw new Error("Multiple Host renewal tasks found; refusing to overwrite them");
    const notes = `最近安装成功：${schedule.installedAt}\n提醒：${schedule.remindAt}\n预计签名到期：${schedule.estimatedExpiresAt}（安装后 7 天估算，实际以描述文件为准）。\n连接 iPhone 到 Windows 后，使用原 WSL 安装命令重新签名安装；原生代码未变时可沿用可信 IPA。`;
    const task = existing[0]
      ? (await tx`update public.tasks set notes=${notes},completed=false,completed_at=null,due_date=${schedule.date},due_time=${schedule.time} where user_id=${userId} and id=${existing[0].id} returning id`)[0]
      : (await tx`insert into public.tasks(user_id,title,notes,due_date,due_time,priority,tags) values(${userId},${title},${notes},${schedule.date},${schedule.time},'medium',${['EvaOrbit', markerTag]}) returning id`)[0];
    const rules = await tx`select id,reminder_id from public.task_reminders where user_id=${userId} and task_id=${task.id} order by id`;
    if (rules.length > 1) throw new Error("Host renewal task has multiple rules; refusing to replace them");
    const rule = rules[0] ?? (await tx`insert into public.task_reminders(user_id,task_id,trigger_type,relative_to,offset_minutes,timezone,repeat_while_overdue) values(${userId},${task.id},'relative','due',0,'Asia/Shanghai',false) returning id,reminder_id`)[0];
    // Preserve Apple ownership so the existing EventKit link updates the same Apple Reminder.
    await tx`update public.task_reminders set trigger_type='relative',relative_to='due',offset_minutes=0,absolute_date=null,absolute_time=null,timezone='Asia/Shanghai',repeat_while_overdue=false where user_id=${userId} and id=${rule.id}`;
    const projections = await tx`select id from public.reminders where user_id=${userId} and source_type='task_reminder' and source_id=${rule.id}`;
    let reminderId = projections[0]?.id;
    if (reminderId) {
      await tx`update public.reminders set title=${title},note=${notes},starts_at=${schedule.remindAt},next_due_at=${schedule.remindAt},overdue_after=${schedule.remindAt},due_has_explicit_time=true,timezone='Asia/Shanghai',lead_time_minutes=0,repeat_while_overdue=false,is_active=true,status='scheduled',snoozed_until=null,last_notified_at=null,sent_at=null,cancelled_at=null,last_completed_at=null where user_id=${userId} and id=${reminderId}`;
    } else {
      reminderId = (await tx`insert into public.reminders(user_id,title,target_type,target_id,source_type,source_id,schedule_type,starts_at,next_due_at,overdue_after,due_has_explicit_time,timezone,note,lead_time_minutes,repeat_while_overdue,status,is_active) values(${userId},${title},'task',${task.id},'task_reminder',${rule.id},'one_time',${schedule.remindAt},${schedule.remindAt},${schedule.remindAt},true,'Asia/Shanghai',${notes},0,false,'scheduled',true) returning id`)[0].id;
    }
    await tx`update public.task_reminders set reminder_id=${reminderId} where user_id=${userId} and id=${rule.id}`;
    await tx`update public.tasks set reminder_id=${reminderId} where user_id=${userId} and id=${task.id}`;
    return { taskId: Number(task.id), remindAt: schedule.remindAt };
  });
}

async function main() {
  try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const retry = process.argv.includes("--retry");
  const schedule = hostRenewalSchedule(retry ? JSON.parse(fs.readFileSync(receiptPath, "utf8")).installedAt : process.argv[2]);
  if (!retry) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(`${receiptPath}.tmp`, JSON.stringify(schedule, null, 2));
    fs.renameSync(`${receiptPath}.tmp`, receiptPath);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env.local; installation receipt was saved");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: true, connect_timeout: 15, onnotice: () => {} });
  const timeout = setTimeout(() => { void sql.end({ timeout: 1 }); }, 30_000);
  try {
    const result = await updateHostRenewalReminder(sql, schedule, process.env.EVAORBIT_ALLOWED_EMAIL?.trim());
    console.log(`EO Host renewal reminder updated: task ${result.taskId}, ${schedule.date} ${schedule.time} Asia/Shanghai. Open Host to sync Apple Reminders.`);
  } finally { clearTimeout(timeout); await sql.end({ timeout: 2 }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Connection failures can contain credentials; keep diagnostics out of the install log.
    console.error("Host installed, but renewal reminder could not be updated. Check .env.local/database access, then run node scripts/ios/host-renewal-reminder.mjs --retry.");
    process.exitCode = 1;
  });
}
