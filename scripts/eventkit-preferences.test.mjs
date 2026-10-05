import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
test("account preference migration is repeatable, owner isolated and revision guarded", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  const rollback = new Error("rollback preference test");
  try {
    await assert.rejects(sql.begin(async tx => {
      const migration = readFileSync(new URL("../supabase/migrations/202610050004_eventkit_preferences.sql", import.meta.url), "utf8").trim().replace(/^begin;\s*/, "").replace(/\s*commit;$/, "");
      await tx.unsafe(migration); await tx.unsafe(migration);
      const user = randomUUID(), other = randomUUID();
      await tx`insert into auth.users(id) values(${user}),(${other})`;
      await tx`select set_config('request.jwt.claim.sub',${user},true)`;
      await tx`set local role authenticated`;
      const preferences = { version: 1, sources: [], routes: {} };
      const save = revision => tx`select (public.save_eventkit_preferences(${tx.json(preferences)}::jsonb,${revision})).revision`;
      assert.equal(Number((await save(0))[0].revision), 1);
      assert.equal(Number((await save(1))[0].revision), 2);
      await assert.rejects(tx.savepoint(t => t`select public.save_eventkit_preferences(${t.json(preferences)}::jsonb,1)`), /revision conflict/);
      await assert.rejects(tx.savepoint(t => t`select public.save_eventkit_preferences('{}'::jsonb,2)`), /check constraint/);
      await assert.rejects(tx.savepoint(t => t`insert into public.eventkit_preferences(preferences) values(${t.json(preferences)})`), /permission denied/);
      assert.equal((await tx`select user_id from public.eventkit_preferences`)[0].user_id, user);
      await tx`select set_config('request.jwt.claim.sub',${other},true)`;
      assert.equal((await tx`select * from public.eventkit_preferences`).length, 0);
      await tx`set local role anon`;
      await assert.rejects(tx.savepoint(t => t`select public.save_eventkit_preferences(${t.json(preferences)}::jsonb,0)`), /permission denied/);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
