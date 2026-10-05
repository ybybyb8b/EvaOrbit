import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

test("Sleep migration safely extends existing schema; ingest is atomic, revision-safe, account isolated and heart disabled", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const rollback = new Error("rollback sleep validation");
  try {
    await assert.rejects(sql.begin(async tx => {
      const source = readFileSync(new URL("../supabase/migrations/202610050002_healthkit_sleep_read_samples.sql", import.meta.url), "utf8").trim().replace(/^begin;\s*/, "").replace(/\s*commit;$/, "");
      const before = await tx`select id,user_id,installation_id,token_hash,revoked_at from public.native_devices order by id`;
      await tx.unsafe(source);
      await tx.unsafe(source); // Safe reapplication cannot duplicate objects or alter existing identities.
      assert.deepEqual(await tx`select id,user_id,installation_id,token_hash,revoked_at from public.native_devices order by id`, before);
      const user = randomUUID(), other = randomUUID(), installation = randomUUID(), reinstall = randomUUID(), sampleId = randomUUID();
      await tx`insert into auth.users(id) values(${user}),(${other})`;
      const sleep = { operation: "upsert", metric: "sleep", sampleId, streamId: randomUUID(), revision: 1, startAt: "2026-10-04T15:00:00Z", endAt: "2026-10-04T23:00:00Z", timeZone: "Asia/Shanghai", timeZoneSource: "metadata", stage: 5, sourceName: "Synthetic test Watch" };
      const ingest = (changes, owner = user, device = installation, enabled = ["sleep"]) => tx`select public.ingest_healthkit_read_changes(${owner}::uuid,${device}::uuid,${tx.json(changes)}::jsonb,${enabled}::text[]) as result`;
      assert.equal((await ingest([sleep]))[0].result.accepted, 1);
      assert.equal((await ingest([sleep]))[0].result.accepted, 0);
      assert.equal((await ingest([{ ...sleep, revision: 2, stage: 4 }]))[0].result.accepted, 1);
      assert.equal((await ingest([sleep]))[0].result.accepted, 0);
      assert.equal((await tx`select stage from public.healthkit_read_samples where user_id=${user}`)[0].stage, 4);
      await ingest([sleep], user, reinstall);
      await ingest([{ ...sleep, streamId: randomUUID() }]);
      assert.equal(Number((await tx`select count(*) as count from public.healthkit_read_samples where user_id=${user}`)[0].count), 1, "reinstall uses account sample identity");
      await ingest([sleep], other);
      await ingest([{ operation: "delete", metric: "sleep", sampleId, streamId: sleep.streamId, revision: 3 }]);
      await ingest([sleep]);
      await ingest([{ ...sleep, revision: 2 }], user, reinstall);
      assert.equal((await tx`select deleted from public.healthkit_read_samples where user_id=${user}`)[0].deleted, true, "stale retry or reinstall cannot resurrect a deleted UUID");
      assert.equal((await tx`select deleted from public.healthkit_read_samples where user_id=${other}`)[0].deleted, false);
      const heart = { ...sleep, metric: "heart_rate", sampleId: randomUUID(), stage: undefined, value: 60, unit: "count/min" };
      // Use savepoints so expected SQL exceptions do not abort the rehearsal transaction.
      async function rejected(changes, pattern) {
        await assert.rejects(tx.savepoint(save => save`select public.ingest_healthkit_read_changes(${user}::uuid,${installation}::uuid,${save.json(changes)}::jsonb)`), pattern);
      }
      await rejected([heart], /sync disabled/);
      assert.equal(Number((await tx`select count(*) as count from public.healthkit_read_samples where user_id=${user} and metric<>'sleep'`)[0].count), 0);
      const atomicId = randomUUID();
      await rejected([{ ...sleep, sampleId: atomicId }, { ...sleep, sampleId: randomUUID(), endAt: "2026-10-04T14:00:00Z" }], /check constraint/);
      assert.equal(Number((await tx`select count(*) as count from public.healthkit_read_samples where sample_id=${atomicId}`)[0].count), 0);
      for (const metric of ["heart_rate", "resting_heart_rate", "hrv"]) {
        await ingest([{ ...heart, metric, sampleId: randomUUID(), value: metric === "hrv" ? 42 : 60, unit: metric === "hrv" ? "ms" : "count/min" }], user, installation, ["sleep",metric]);
      }
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub',${user},true)`;
      const owners = await tx`select distinct user_id from public.healthkit_read_samples`;
      assert.deepEqual(owners.map(row => row.user_id), [user]);
      await assert.rejects(tx`select public.ingest_healthkit_read_changes(${user}::uuid,${installation}::uuid,'[]'::jsonb)`, /permission denied/);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
