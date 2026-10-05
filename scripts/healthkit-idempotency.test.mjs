import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";

test("HealthKit repeated energy, weight and menstrual uploads preserve record identity and manual write-back", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const rollback = new Error("rollback HealthKit idempotency validation");
  try {
    await assert.rejects(sql.begin(async tx => {
      const user = randomUUID();
      await tx`insert into auth.users(id) values(${user})`;
      const ingest = (name, rows) => tx`select public.${tx(name)}(${user}::uuid,${tx.json(rows)}::jsonb)`;
      const energy = [{ localDate: "2026-10-01", metric: "resting", kcal: 1500, revision: 1, sampleCount: 20, calculatedAt: "2026-10-01T15:00:00Z" }, { localDate: "2026-10-01", metric: "active", kcal: 300, revision: 1, sampleCount: 10, calculatedAt: "2026-10-01T15:00:00Z" }];
      const weight = { operation: "upsert", sampleId: randomUUID(), occurredAt: "2026-10-01T00:00:00Z", weightKg: 60, sourceBundle: "synthetic.test", sourceName: "Synthetic fixture" };
      const flow = { operation: "upsert", sampleId: randomUUID(), startAt: "2026-09-30T16:00:00Z", endAt: "2026-10-01T16:00:00Z", flow: "light", cycleStart: true, sourceBundle: "synthetic.test", sourceName: "Synthetic fixture" };
      for (let run = 0; run < 10; run++) {
        await ingest("ingest_healthkit_energy_snapshots", energy);
        await ingest("ingest_healthkit_body_mass_changes", [weight]);
        await ingest("ingest_healthkit_menstrual_flow_changes", [flow]);
      }
      assert.equal(Number((await tx`select count(*) as n from public.healthkit_daily_energy where user_id=${user}`)[0].n), 1);
      const [firstWeight] = await tx`select id from public.weight_records where user_id=${user}`;
      assert.equal(Number((await tx`select count(*) as n from public.weight_records where user_id=${user}`)[0].n), 1);
      const [firstFlow] = await tx`select id from public.menstrual_flow_records where user_id=${user}`;
      assert.equal(Number((await tx`select count(*) as n from public.menstrual_flow_records where user_id=${user}`)[0].n), 1);
      assert.equal(Number((await tx`select count(*) as n from public.menstrual_periods where user_id=${user}`)[0].n), 1);
      await ingest("ingest_healthkit_body_mass_changes", [{ ...weight, weightKg: 61 }]);
      assert.equal((await tx`select id from public.weight_records where user_id=${user}`)[0].id, firstWeight.id);
      await ingest("ingest_healthkit_menstrual_flow_changes", [{ ...flow, flow: "medium" }]);
      assert.equal((await tx`select id from public.menstrual_flow_records where user_id=${user}`)[0].id, firstFlow.id);
      const weightSync = `evaorbit.weight.${randomUUID()}`, flowSync = `evaorbit.menstrual_flow.${randomUUID()}`;
      const [manualWeight] = await tx`insert into public.weight_records(user_id,occurred_at,weight_kg,source,healthkit_sync_identifier) values(${user},'2026-10-02T00:00:00Z',62,'manual',${weightSync}) returning id`;
      const [manualFlow] = await tx`insert into public.menstrual_flow_records(user_id,occurred_at,ended_at,flow,source,healthkit_sync_identifier,healthkit_sync_status) values(${user},'2026-10-01T16:00:00Z','2026-10-02T16:00:00Z','light','manual',${flowSync},'pending') returning id`;
      const echoWeight = { ...weight, sampleId: randomUUID(), syncIdentifier: weightSync, occurredAt: "2026-10-02T00:00:00Z", weightKg: 62, syncVersion: 1 };
      const echoFlow = { ...flow, sampleId: randomUUID(), syncIdentifier: flowSync, startAt: "2026-10-01T16:00:00Z", endAt: "2026-10-02T16:00:00Z", cycleStart: false, syncVersion: 1 };
      for (let run = 0; run < 10; run++) {
        await ingest("ingest_healthkit_body_mass_changes", [echoWeight]);
        await ingest("ingest_healthkit_menstrual_flow_changes", [echoFlow]);
      }
      assert.equal(Number((await tx`select count(*) as n from public.weight_records where user_id=${user}`)[0].n), 2);
      assert.equal(Number((await tx`select count(*) as n from public.menstrual_flow_records where user_id=${user}`)[0].n), 2);
      assert.equal((await tx`select id from public.weight_records where user_id=${user} and healthkit_sample_id=${echoWeight.sampleId}`)[0].id, manualWeight.id);
      assert.equal((await tx`select id from public.menstrual_flow_records where user_id=${user} and healthkit_sample_id=${echoFlow.sampleId}`)[0].id, manualFlow.id);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
