import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { trainingTemplate } from "../src/lib/training-plan.ts";

test("Supabase migration is repeatable; training completion is atomic, isolated and idempotent", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const rollback = new Error("rollback training plan verification");
  try {
    await assert.rejects(sql.begin(async tx => {
      const source = readFileSync(new URL("../supabase/migrations/202610150001_training_plans.sql", import.meta.url), "utf8").trim().replace(/^begin;\s*/, "").replace(/\s*commit;$/, "");
      const before = await tx`select count(*)::integer as count from public.training_logs`;
      await tx.unsafe(source); await tx.unsafe(source);
      assert.deepEqual(await tx`select count(*)::integer as count from public.training_logs`, before);
      const owner = randomUUID(), other = randomUUID(), key = randomUUID();
      await tx`insert into auth.users(id) values(${owner}),(${other})`;
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
      const template = trainingTemplate();
      const save = (plan, expectedVersion) => tx`select public.save_training_plan(${expectedVersion}::bigint,${plan.name},${tx.json(plan.days)}::jsonb,${plan.currentDayId}) as result`;
      let plan = (await save(template, 0))[0].result;
      const log = { occurredAt: "2026-10-15T04:00:00Z", occurredHasExplicitTime: false, trainingType: "strength", bodyParts: ["手臂", "核心"], teacher: "", course: "Day 1｜上肢 + 核心", durationMinutes: 25, notes: template.days[0].content };
      const complete = (version, dayId, requestKey = randomUUID(), payload = log) => tx`select public.complete_training_plan(${version}::bigint,${dayId},${requestKey}::uuid,${tx.json(payload)}::jsonb) as result`;
      const result = (await complete(1, "day-1", key))[0].result;
      assert.equal(result.plan.current_day_id, "day-2");
      assert.equal(result.log.occurred_has_explicit_time, false);
      assert.equal((await complete(1, "day-1", key))[0].result.log.id, result.log.id);
      await assert.rejects(tx.savepoint(s => s`select public.complete_training_plan(1,'day-1',${randomUUID()}::uuid,${s.json(log)}::jsonb)`), /TRAINING_PLAN_CONFLICT/);
      await assert.rejects(tx.savepoint(s => s`select public.complete_training_plan(2,'day-2',${randomUUID()}::uuid,${s.json({ ...log, durationMinutes: -1 })}::jsonb)`), /check constraint/);
      assert.equal((await tx`select version from public.training_plans`)[0].version, "2");
      assert.equal((await tx`select count(*)::integer as count from public.training_logs`)[0].count, 1);
      plan = result.plan;
      for (const expected of ["day-3", "day-4", "day-1"]) {
        plan = (await complete(Number(plan.version), plan.current_day_id))[0].result.plan;
        assert.equal(plan.current_day_id, expected);
      }
      assert.equal((await complete(1, "day-1", key))[0].result.log.id, result.log.id);
      await assert.rejects(tx.savepoint(s => s`update public.training_plans set current_day_id='missing'`), /check constraint/);
      await assert.rejects(tx.savepoint(s => s`select public.save_training_plan(${Number(plan.version)}::bigint,'Bad',${s.json([{ ...template.days[0], videoUrls: ["javascript:alert(1)"] }])}::jsonb,'day-1')`), /check constraint/);
      const empty = (await save({ name: template.name, days: [], currentDayId: null }, Number(plan.version)))[0].result;
      assert.equal(empty.current_day_id, null);
      assert.equal((await tx`select notes from public.training_logs where id=${result.log.id}`)[0].notes, log.notes);
      await tx`select set_config('request.jwt.claim.sub',${other},true)`;
      assert.equal((await tx`select * from public.training_plans`).length, 0);
      assert.equal((await tx`select * from public.training_logs`).length, 0);
      await assert.rejects(tx.savepoint(s => s`select public.complete_training_plan(1,'day-1',${key}::uuid,${s.json(log)}::jsonb)`), /TRAINING_PLAN_CONFLICT/);
      await tx`set local role anon`;
      await assert.rejects(tx.savepoint(s => s`select public.save_training_plan(0,'x','[]'::jsonb,null)`), /permission denied/);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});

test("Supabase concurrent devices and duplicate retries advance exactly once", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 3, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const owner = randomUUID(), key = randomUUID();
  const template = trainingTemplate();
  const log = { occurredAt: "2026-10-15T04:00:00Z", occurredHasExplicitTime: false, trainingType: "strength", bodyParts: ["核心"], teacher: "", course: "Concurrency verification", durationMinutes: 20, notes: "Synthetic test" };
  const asOwner = action => sql.begin(async tx => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
    return action(tx);
  });
  try {
    await sql`insert into auth.users(id) values(${owner})`;
    await asOwner(tx => tx`select public.save_training_plan(0,${template.name},${tx.json(template.days)}::jsonb,${template.currentDayId})`);
    const complete = (version, day, requestKey) => asOwner(async tx => (await tx`select public.complete_training_plan(${version}::bigint,${day},${requestKey}::uuid,${tx.json(log)}::jsonb) as result`)[0].result);
    const duplicate = await Promise.all([complete(1,"day-1",key),complete(1,"day-1",key)]);
    assert.equal(duplicate[0].log.id, duplicate[1].log.id);
    const devices = await Promise.allSettled([complete(2,"day-2",randomUUID()),complete(2,"day-2",randomUUID())]);
    assert.equal(devices.filter(result => result.status === "fulfilled").length, 1);
    assert.match(devices.find(result => result.status === "rejected").reason.message, /TRAINING_PLAN_CONFLICT/);
    assert.equal((await sql`select current_day_id from public.training_plans where user_id=${owner}`)[0].current_day_id,"day-3");
    assert.equal((await sql`select count(*)::integer as count from public.training_logs where user_id=${owner}`)[0].count,2);
  } finally {
    // Only remove the random synthetic account created by this test, including its cascaded fixtures.
    await sql`delete from auth.users where id=${owner}`;
    await sql.end();
  }
});
