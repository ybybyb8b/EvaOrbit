import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CHATGPT_CLIENT, HERMES_CLIENT } from "../src/lib/mcp/agent-policy.ts";

const migration = readFileSync(new URL("../supabase/migrations/202611180001_agent_access.sql", import.meta.url), "utf8");
const restoreLegacy = readFileSync(new URL("./agent-access-restore-legacy.sql", import.meta.url), "utf8");
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const codex = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const secret = "f".repeat(64);
const audience = "https://eva-orbit.vercel.app/api/mcp";

test("Agent migration preserves prior ChatGPT consent, retires Hermes and enforces REST, RPC, Storage and owner boundaries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create role authenticator; create role supabase_auth_admin;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create table auth.oauth_consents(user_id uuid,client_id uuid,granted_at timestamptz not null default now(),revoked_at timestamptz);
      create function auth.jwt() returns jsonb language sql as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
      create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,storage to authenticated;
      create table storage.objects(id int,owner uuid); create table storage.buckets(id int);
      alter table storage.objects enable row level security; alter table storage.buckets enable row level security;
      create policy baseline_owner on storage.objects for all to authenticated using (owner=auth.uid()) with check (owner=auth.uid());
      create policy baseline_bucket on storage.buckets for select to authenticated using (true);
      grant select,insert,update,delete on storage.objects to authenticated;
      grant select on storage.buckets to authenticated;
      create table public.inbox_items(id bigint generated always as identity primary key,user_id uuid not null,content text not null,source text not null);
      alter table public.inbox_items enable row level security;
      grant select on public.inbox_items to authenticated;
      create policy baseline_inbox on public.inbox_items using (user_id=auth.uid());
      create publication supabase_realtime for table public.inbox_items;
      insert into auth.users values ('${first}'),('${second}');
      insert into auth.oauth_consents(user_id,client_id) values
        ('${first}','${CHATGPT_CLIENT}'),('${first}','${HERMES_CLIENT}'),('${first}','${codex}'),('${second}','${codex}');
      insert into storage.objects values (1,'${first}'),(2,'${second}');
      insert into storage.buckets values (1);
    `);
    await db.exec(migration);
    assert.deepEqual((await db.query("select policyname from pg_policies where policyname='evaorbit_agent_data_path'")).rows, []);
    const activate = () => db.query("select evaorbit_agent_private.activate(sha256(convert_to($1,'UTF8')))", [secret]);
    const hookAudience = async (client) => (await db.query(
      "select public.evaorbit_mcp_access_token_hook($1::jsonb)->'claims'->>'aud' as aud",
      [JSON.stringify({ user_id:first, claims:{ aud:"authenticated", client_id:client } })],
    )).rows[0].aud;
    await db.exec("alter role authenticator set pgrst.db_pre_request = 'public.other_boundary'");
    await assert.rejects(activate(), /existing Data API pre-request hook/);
    await assert.rejects(db.exec(restoreLegacy), /manually/);
    await db.exec("rollback");
    await db.exec("alter role authenticator reset pgrst.db_pre_request");
    assert.equal(await hookAudience(CHATGPT_CLIENT), audience);
    assert.equal(await hookAudience(codex), "authenticated");
    await activate();
    await activate();
    const run = async (user, client, bridge, fn) => db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)", [
        JSON.stringify({ sub:user, aud:client ? audience : "authenticated", ...(client ? { client_id:client } : {}) }),
        JSON.stringify(bridge ? { "x-evaorbit-agent-bridge":bridge } : {}),
      ]);
      return fn(tx);
    });
    const boundary = (tx) => tx.exec("select public.evaorbit_agent_data_boundary()");
    const session = async (tx) => {
      await boundary(tx);
      return (await tx.query("select public.evaorbit_agent_session() as connection")).rows[0].connection;
    };
    assert.equal((await run(first, CHATGPT_CLIENT, secret, session)).state, "active");
    assert.equal((await run(first, HERMES_CLIENT, secret, session)).state, "revoked");
    const pending = await run(first, codex, secret, session);
    assert.equal(pending.state, "pending");
    assert.deepEqual(pending.policy, {});
    assert.equal(await hookAudience(codex), audience);
    await assert.rejects(run(first, codex, undefined, boundary), /restricted to EvaOrbit MCP/);
    await assert.rejects(run(first, codex, "0".repeat(64), boundary), /restricted to EvaOrbit MCP/);
    await assert.rejects(run(first, codex, undefined, (tx) => tx.exec("select public.evaorbit_agent_session()")), /bridge required/);
    await assert.rejects(run(first, undefined, secret, (tx) => tx.exec("select public.evaorbit_agent_session()")), /bridge required/);
    assert.deepEqual((await run(first, codex, undefined, (tx) => tx.query("select id from storage.objects"))).rows, []);
    assert.deepEqual((await run(first, codex, undefined, (tx) => tx.query("select id from storage.buckets"))).rows, []);
    assert.deepEqual((await run(first, undefined, undefined, async (tx) => {
      await boundary(tx);
      return tx.query("select id from storage.objects");
    })).rows, [{ id:1 }]);
    assert.deepEqual((await run(second, undefined, undefined, (tx) => tx.query("select client_id from public.agent_connections"))).rows, []);
    await run(first, undefined, undefined, (tx) => tx.query("update public.agent_connections set state='active' where client_id=$1", [codex]));
    const capture = (tx, content) => tx.query("select x->>'id' as id, x->>'agent_client_id' as agent_client_id from public.evaorbit_agent_capture($1,$2) x", [content, requestId]);
    const initial = await run(first, codex, secret, async (tx) => { await boundary(tx); return capture(tx, "Synthetic capture"); });
    const replay = await run(first, codex, secret, async (tx) => { await boundary(tx); return capture(tx, "Synthetic capture"); });
    assert.deepEqual(initial.rows, replay.rows);
    assert.equal(initial.rows[0].agent_client_id, codex);
    await assert.rejects(run(first, codex, secret, async (tx) => { await boundary(tx); return capture(tx, "Different content"); }), /different content/);
    assert.deepEqual((await run(second, codex, secret, async (tx) => { await session(tx); return tx.query("select id from public.inbox_items"); })).rows, []);
    assert.deepEqual((await run(first, codex, undefined, (tx) => tx.query("select id from public.inbox_items"))).rows, []);
    const receipt = (tx, result) => tx.query("select public.evaorbit_agent_write_receipt($1,$2,$3,'1') as receipt", [requestId, "a".repeat(64), result]);
    assert.equal((await run(first, codex, secret, async (tx) => { await boundary(tx); return receipt(tx, null); })).rows[0].receipt.claimed, true);
    assert.equal((await run(first, codex, secret, async (tx) => { await boundary(tx); return receipt(tx, null); })).rows[0].receipt.result, "unknown");
    await run(first, codex, secret, async (tx) => { await boundary(tx); return receipt(tx, "allowed"); });
    assert.equal((await run(first, codex, secret, async (tx) => { await boundary(tx); return receipt(tx, null); })).rows[0].receipt.result, "allowed");
    await run(first, undefined, undefined, (tx) => tx.query("update public.agent_connections set state='revoked' where client_id=$1", [codex]));
    assert.equal((await run(first, codex, secret, session)).state, "revoked");
    assert.equal((await run(first, CHATGPT_CLIENT, secret, session)).state, "active");
    assert.equal((await run(first, undefined, undefined, (tx) => tx.query("update public.agent_connections set state='active' where client_id=$1 returning state", [codex]))).rows.length, 0);
    await db.exec(restoreLegacy);
    await db.exec(restoreLegacy);
    assert.equal(await hookAudience(CHATGPT_CLIENT), audience);
    assert.equal(await hookAudience(codex), "authenticated");
    assert.deepEqual((await db.query("select policyname from pg_policies where policyname='evaorbit_agent_data_path'")).rows, []);
    assert.deepEqual((await db.query("select digest from evaorbit_agent_private.bridge_keys")).rows, []);
    assert.deepEqual((await run(first, CHATGPT_CLIENT, undefined, (tx) => tx.query("select id from storage.objects"))).rows, [{ id:1 }]);
    assert.equal((await db.query("select count(*)::int as count from public.inbox_items")).rows[0].count, 1);
    await activate();
    assert.equal((await run(first, CHATGPT_CLIENT, secret, session)).state, "active");
    assert.equal((await run(first, HERMES_CLIENT, secret, session)).state, "revoked");
    assert.equal((await run(first, codex, secret, session)).state, "revoked");
  } finally {
    await db.close();
  }
});
