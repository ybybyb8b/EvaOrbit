import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

test("training option exclusions are idempotent, reversible and account isolated", { skip: !process.env.DATABASE_URL }, async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  const rollback = new Error("rollback training suggestion verification");
  try {
    await assert.rejects(sql.begin(async tx => {
      const migration = fs.readFileSync("supabase/migrations/202611020001_training_suggestion_exclusions.sql", "utf8").trim().replace(/^begin;\s*/, "").replace(/\s*commit;$/, "");
      await tx.unsafe(migration); await tx.unsafe(migration);
      const owner = randomUUID(), other = randomUUID();
      await tx`insert into auth.users(id) values(${owner}),(${other})`;
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
      await tx`insert into public.training_suggestion_exclusions(user_id,kind,value) values(${owner},'exercise','肩绕还') on conflict do nothing`;
      await tx`insert into public.training_suggestion_exclusions(user_id,kind,value) values(${owner},'exercise','肩绕还') on conflict do nothing`;
      assert.equal((await tx`select * from public.training_suggestion_exclusions`).length, 1);
      await tx`select set_config('request.jwt.claim.sub',${other},true)`;
      assert.equal((await tx`select * from public.training_suggestion_exclusions`).length, 0);
      assert.equal((await tx`delete from public.training_suggestion_exclusions where user_id=${owner} returning *`).length, 0);
      await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
      await tx`delete from public.training_suggestion_exclusions where kind='exercise' and value='肩绕还'`;
      assert.equal((await tx`select * from public.training_suggestion_exclusions`).length, 0);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
