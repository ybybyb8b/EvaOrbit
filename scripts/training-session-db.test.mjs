import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { trainingTemplate, trainingDayDraft } from "../src/lib/training-plan.ts";

test("Training session migration keeps legacy logs; snapshots and progress commit together", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const rollback = new Error("rollback training session verification");
  try {
    await assert.rejects(sql.begin(async tx => {
      const before = await tx`select id,user_id,course,notes from public.training_logs order by id`;
      const source = readFileSync("supabase/migrations/202610260003_training_session_details.sql", "utf8").trim().replace(/^begin;\s*/, "").replace(/\s*commit;$/, "");
      await tx.unsafe(source); await tx.unsafe(source);
      assert.deepEqual(await tx`select id,user_id,course,notes from public.training_logs order by id`, before);
      const owner = randomUUID(), other = randomUUID(), key = randomUUID();
      await tx`insert into auth.users(id) values(${owner}),(${other})`;
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
      const template = trainingTemplate();
      template.days[0].exercises = [{ id: "row", name: "划船", sets: 3, target: "12 次" }];
      template.days[0].videoUrls = ["https://example.com/practice"];
      await tx`select public.save_training_plan(0,${template.name},${tx.json(template.days)}::jsonb,${template.currentDayId})`;
      const log = { occurredAt: "2026-10-26T04:00:00Z", occurredHasExplicitTime: false, ...trainingDayDraft({ ...template, version: 1, updatedAt: "" }) };
      log.sessionDetails.exercises[0].completedSets = 2;
      log.sessionDetails.videos[0].completed = true;
      const invalid = { ...log, sessionDetails: { ...log.sessionDetails, exercises: [{ ...log.sessionDetails.exercises[0], completedSets: 4 }] } };
      await assert.rejects(tx.savepoint(s => s`select public.complete_training_plan(1,'day-1',${randomUUID()}::uuid,${s.json(invalid)}::jsonb)`), /check constraint/);
      assert.equal((await tx`select version from public.training_plans`)[0].version, "1");
      assert.equal((await tx`select count(*)::integer as n from public.training_logs`)[0].n, 0);
      const [done] = await tx`select public.complete_training_plan(1,'day-1',${key}::uuid,${tx.json(log)}::jsonb) as result`;
      assert.deepEqual(done.result.log.session_details, log.sessionDetails);
      assert.equal(done.result.log.course, ""); assert.equal(done.result.log.notes, "");
      assert.equal(done.result.plan.current_day_id, "day-2");
      const [retry] = await tx`select public.complete_training_plan(1,'day-1',${key}::uuid,${tx.json(log)}::jsonb) as result`;
      assert.equal(retry.result.log.id, done.result.log.id);
      assert.deepEqual(retry.result.log.session_details, log.sessionDetails);
      await tx`update public.training_logs set notes='MCP patch' where id=${done.result.log.id}`;
      assert.deepEqual((await tx`select session_details from public.training_logs where id=${done.result.log.id}`)[0].session_details,log.sessionDetails);
      template.days[0].exercises[0].name = "Changed plan";
      await tx`select public.save_training_plan(2,${template.name},${tx.json(template.days)}::jsonb,'day-2')`;
      assert.equal((await tx`select session_details from public.training_logs where id=${done.result.log.id}`)[0].session_details.exercises[0].name,"划船");
      const badDays = structuredClone(template.days); badDays[0].exercises[0].sets = -1;
      await assert.rejects(tx.savepoint(s => s`select public.save_training_plan(3,${template.name},${s.json(badDays)}::jsonb,'day-2')`), /check constraint/);
      await tx`select set_config('request.jwt.claim.sub',${other},true)`;
      assert.equal((await tx`select * from public.training_logs`).length,0);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
