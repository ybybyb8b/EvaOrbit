import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

test("HealthKit no-flow closes an open period and preserves edited end dates", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  const rollback = new Error("rollback fixture");
  try {
    await assert.rejects(sql.begin(async (tx) => {
      // Install the replacement inside this rolled-back transaction.
      const migration = readFileSync(new URL("../supabase/migrations/202610030001_healthkit_no_flow_period_end.sql", import.meta.url), "utf8");
      const definition = migration.slice(migration.indexOf("create or replace function"), migration.indexOf("\ndo $$"));
      await tx.unsafe(definition);
      const user = randomUUID();
      await tx`insert into auth.users(id) values (${user})`;
      const [period] = await tx`insert into public.menstrual_periods(user_id,started_on) values (${user},'2026-09-27') returning id`;
      await tx`insert into public.menstrual_flow_records(user_id,period_id,occurred_at,ended_at,flow,source)
        values (${user},${period.id},'2026-09-30T16:00:00Z','2026-10-01T16:00:00Z','light','apple_health'),
               (${user},${period.id},'2026-09-29T04:00:00Z','2026-09-29T04:00:00Z','none','apple_health')`;
      const end = async () => (await tx`select ended_on::text as value from public.menstrual_periods where id=${period.id}`)[0].value;
      await tx`select public.reconcile_healthkit_menstrual_periods(${user})`;
      assert.equal(await end(), null, "older no-flow does not close later bleeding");
      await tx`insert into public.menstrual_flow_records(user_id,period_id,occurred_at,ended_at,flow,source)
        values (${user},${period.id},'2026-10-02T04:00:00Z','2026-10-02T04:00:00Z','none','apple_health')`;
      await tx`select public.reconcile_healthkit_menstrual_periods(${user})`;
      assert.equal(await end(), "2026-10-01", "exclusive midnight end preserves last bleeding date");
      await tx`update public.menstrual_periods set ended_on='2026-09-30' where id=${period.id}`;
      await tx`insert into public.menstrual_periods(user_id,started_on) values (${user},'2026-10-27')`;
      await tx`select public.reconcile_healthkit_menstrual_periods(${user})`;
      await tx`select public.reconcile_healthkit_menstrual_periods(${user})`;
      assert.equal(await end(), "2026-09-30", "later imports preserve a user's edited end");
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await sql.end();
  }
});
