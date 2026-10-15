import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("SQLite training completion is atomic, idempotent, version-safe and preserves existing logs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-training-plan-"));
  try {
    const program = String.raw`
      import assert from "node:assert/strict";
      import { randomUUID } from "node:crypto";
      import { DatabaseSync } from "node:sqlite";
      import { writeFileSync } from "node:fs";
      import { spawnSync } from "node:child_process";
      import { BACKUP_TABLES, BACKUP_VERSION, BACKUP_SCHEMA_VERSION, emptyBackupResources, sanitizeExportRow } from "./src/lib/data-backup.ts";
      import { getRepository } from "./src/lib/repositories/index.ts";
      import { parseTrainingPlanWrite, trainingTemplate, trainingDayDraft, retainedTrainingDay } from "./src/lib/training-plan.ts";
      const r = await getRepository();
      const log = { occurredAt: "2026-10-15T04:00:00.000Z", occurredHasExplicitTime: false, ...trainingDayDraft({ ...trainingTemplate(), version: 1, updatedAt: "" }) };
      const ordinary = await r.createTrainingLog(log);
      assert.equal(await r.getTrainingPlan(), null, "ordinary and MCP writes never create a plan");
      let plan = await r.saveTrainingPlan(parseTrainingPlanWrite({ ...trainingTemplate(), expectedVersion: 0 }));
      await assert.rejects(r.saveTrainingPlan({ ...trainingTemplate(), expectedVersion: 0 }), /更新/);
      const initial = structuredClone(plan);
      const firstRequest = { expectedVersion: plan.version, dayId: plan.currentDayId, requestKey: randomUUID(), log };
      const first = await r.completeTrainingPlan(firstRequest);
      assert.equal(first.plan.currentDayId, "day-2");
      assert.equal((await r.completeTrainingPlan(firstRequest)).log.id, first.log.id);
      assert.equal((await r.listTrainingLogs()).length, 2);
      await assert.rejects(r.completeTrainingPlan({ ...firstRequest, requestKey: randomUUID() }), /更新/);
      assert.equal((await r.getTrainingPlan()).version, first.plan.version);
      plan = first.plan;
      // Insert failure rolls back both the new log and the cursor.
      await assert.rejects(r.completeTrainingPlan({ ...firstRequest, expectedVersion: plan.version, dayId: plan.currentDayId, requestKey: randomUUID(), log: { ...log, trainingType: "invalid" } }));
      assert.deepEqual(await r.getTrainingPlan(), plan);
      assert.equal((await r.listTrainingLogs()).length, 2);
      // A failure after insertion must also undo the log.
      const db = new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      db.exec("CREATE TRIGGER fail_plan_advance BEFORE UPDATE ON training_plans BEGIN SELECT RAISE(ABORT,'test rollback'); END");
      await assert.rejects(r.completeTrainingPlan({ ...firstRequest, expectedVersion: plan.version, dayId: plan.currentDayId, requestKey: randomUUID() }), /test rollback/);
      assert.equal((await r.listTrainingLogs()).length, 2);
      db.exec("DROP TRIGGER fail_plan_advance");
      assert.deepEqual(await r.getTrainingPlan(), plan);
      for (const expected of ["day-3", "day-4", "day-1"]) {
        const result = await r.completeTrainingPlan({ expectedVersion: plan.version, dayId: plan.currentDayId, requestKey: randomUUID(), log });
        plan = result.plan;
        assert.equal(plan.currentDayId, expected);
      }
      // Old request remains idempotent after a full cycle.
      assert.equal((await r.completeTrainingPlan(firstRequest)).log.id, first.log.id);
      assert.deepEqual(await r.getTrainingPlan(), plan);
      plan = await r.saveTrainingPlan({ ...plan, days: [...plan.days].reverse(), expectedVersion: plan.version });
      assert.equal(plan.currentDayId, "day-1");
      const remaining = plan.days.filter(day => day.id !== plan.currentDayId);
      const nextDay = retainedTrainingDay(plan.days, remaining, plan.currentDayId);
      plan = await r.saveTrainingPlan({ ...plan, days: remaining, currentDayId: nextDay, expectedVersion: plan.version });
      assert.equal(plan.currentDayId, "day-4");
      assert.deepEqual(await r.getTrainingLog(first.log.id), first.log, "plan editing cannot rewrite historical snapshots");
      await r.updateTrainingLog(ordinary.id, { notes: "MCP update" });
      await r.deleteTrainingLog(first.log.id);
      assert.deepEqual(await r.getTrainingPlan(), plan, "log edits/deletion do not change cursor");
      plan = await r.saveTrainingPlan({ ...plan, days: [], currentDayId: null, expectedVersion: plan.version });
      await assert.rejects(r.completeTrainingPlan({ ...firstRequest, expectedVersion: plan.version, requestKey: randomUUID() }));
      assert.equal(plan.currentDayId, null);
      assert.throws(() => db.prepare("UPDATE training_plans SET current_day_id='missing'").run());
      assert.throws(() => db.prepare("UPDATE training_plans SET days=?,current_day_id='missing'").run(JSON.stringify(initial.days)));
      plan = await r.saveTrainingPlan({ ...initial, expectedVersion: plan.version });
      const resources = emptyBackupResources();
      for (const table of BACKUP_TABLES) resources[table] = db.prepare('SELECT * FROM "' + table + '"').all().map(row => sanitizeExportRow(table,row));
      const backupPath = process.env.EVAORBIT_SQLITE_PATH + '.backup.json';
      writeFileSync(backupPath,JSON.stringify({ backup_version: BACKUP_VERSION, exported_at: new Date().toISOString(), schema: { supabase_migration: BACKUP_SCHEMA_VERSION }, resources }));
      const restored = spawnSync(process.execPath,['scripts/restore-backup.mjs',backupPath],{ encoding: 'utf8', env: process.env });
      assert.equal(restored.status,0,restored.stderr || restored.stdout);
      assert.deepEqual(await r.getTrainingPlan(),plan,'backup restore preserves the current plan, cursor and version');
      db.close();
      console.log("PASS completion, rollback, full loop, retry, stale device, reorder, current deletion, empty plan, independent logs");
    `;
    const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "training.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
