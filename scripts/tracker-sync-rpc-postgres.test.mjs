import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const { PGlite } = await import("@electric-sql/pglite").catch(() => ({ PGlite: null }));

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const source = path => readFileSync(new URL(`../supabase/migrations/${path}`, import.meta.url), "utf8");

test("Tracker sync PostgreSQL transactions, receipts, RLS, versions and complete snapshots", { skip: !PGlite && "Optional @electric-sql/pglite not installed" }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${owner}'),('${other}');
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
      create table public.reminders(id bigint primary key,user_id uuid,title text);
      grant select,update on public.reminders to authenticated;`);
    await db.exec(source("202608260002_trackers.sql"));
    await db.exec(source("202608260004_tracker_insights.sql").split("insert into storage.buckets")[0] + "commit;");
    await db.exec("alter table public.tracker_reminders add column reminder_id bigint;");
    await db.exec(source("202610060001_tracker_settings_lifecycle.sql"));
    const existing = (await db.query("insert into public.trackers(user_id,name) values($1,'Existing before migration') returning id",[owner])).rows[0].id;
    const migration = source("202610180001_tracker_local_sync.sql");
    await db.exec(migration);
    await db.exec(migration); // Safe application over existing objects and data.
    assert.equal((await db.query("select name,sync_version from public.trackers where id=$1",[existing])).rows[0].name,"Existing before migration");
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const sync = async operations => (await db.query("select public.tracker_sync_v2($1,$2::jsonb) response", [owner, JSON.stringify(operations)])).rows[0].response;
    const request = (resourceType, operation, payload, extra = {}) => ({ mutationId: crypto.randomUUID(), localId: crypto.randomUUID(), resourceType, operation, payload, ...extra });
    const first = request("tracker", "create", { name: "Sleep", groupName: "Everyday" });
    const operation = req => ({ request: req, input: req.payload });
    const created = await sync([operation(first)]);
    const id = created.results[0].serverId;
    assert.equal(created.results[0].status, "applied");
    assert.equal((await sync([operation(first)])).results[0].status, "duplicate");
    assert.equal((await sync([operation({ ...first, payload: { name: "different" } })])).results[0].status, "rejected");
    assert.equal((await sync([])).snapshot.records.length, 2);
    // Simulates response loss after commit: replay still returns the original ID.
    assert.equal((await sync([operation(first)])).results[0].serverId, id);
    const change = request("tracker", "update", { name: "Rest" }, { serverId: id, baseVersion: 1 });
    assert.equal((await sync([operation(change)])).results[0].status, "applied");
    assert.equal((await sync([operation(request("tracker", "update", { name: "stale" }, { serverId: id, baseVersion: 1 }))])).results[0].status, "conflict");
    await db.query("update public.trackers set name='Web or MCP' where id=$1", [id]);
    assert.equal((await sync([])).snapshot.records.find(row=>row.serverId===id&&row.resourceType==="tracker").version, 3);
    const key = crypto.randomUUID();
    const field = request("tracker_field", "create", { trackerId: id, key, name: "Amount", type: "number" });
    field.parentVersion = 3;
    assert.equal((await sync([operation(field)])).results[0].status, "applied");
    const entry = request("tracker_entry", "create", { trackerId: id, occurredAt: "2026-10-18T06:00:00Z", values: { [key]: 2 }, note: "local" });
    entry.parentVersion = 4;
    const entryResult = (await sync([operation(entry)])).results[0];
    assert.equal(entryResult.status, "applied");
    assert.equal((await sync([operation({ ...entry, mutationId: crypto.randomUUID(), parentVersion: 3 })])).results[0].status, "conflict");
    const invalid = request("tracker_entry", "create", { ...entry.payload, values: { [key]: "invalid" } });
    invalid.parentVersion = 4;
    assert.equal((await sync([operation(invalid)])).results[0].status, "rejected");
    await db.query("delete from public.tracker_entries where id=$1", [entryResult.serverId]);
    assert.equal((await sync([operation(request("tracker_entry", "delete", {}, { serverId: entryResult.serverId, baseVersion: 1 }))])).results[0].status, "conflict");
    const historical = (await db.query("insert into public.tracker_entries(user_id,tracker_id,occurred_at,values_json,note) values($1,$2,now(),$3::jsonb,'historical') returning id", [owner,id,JSON.stringify({[key]:7})])).rows[0].id;
    await db.query("update public.tracker_fields set archived_at=now() where tracker_id=$1", [id]);
    const editHistory = request("tracker_entry", "update", {trackerId:id,values:{[key]:7},note:"note edit"}, {serverId:historical,baseVersion:1,parentVersion:5});
    assert.equal((await sync([operation(editHistory)])).results[0].status,"applied");
    assert.equal((await db.query("select values_json from public.tracker_entries where id=$1",[historical])).rows[0].values_json[key],7,"archived field history must survive editing");
    // A lost transaction must not leave a claim or a business row behind.
    const rolledBack = request("tracker", "create", { name: "rollback" });
    await db.exec("begin");
    await sync([operation(rolledBack)]);
    await db.exec("rollback");
    assert.equal((await sync([operation(rolledBack)])).results[0].status, "applied");
    await assert.rejects(() => sync(Array.from({ length: 51 }, () => operation(request("tracker", "create", { name: "oversize" })))));
    await db.exec(`reset role; insert into public.trackers(user_id,name) select '${owner}', 'Row '||n from generate_series(1,1100) n; set role authenticated;`);
    const full = await sync([]);
    assert.equal(full.snapshot.complete, true);
    assert.equal(full.snapshot.records.filter(row => row.resourceType === "tracker").length, 1103);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    await assert.rejects(() => sync([]));
    const isolated = (await db.query("select public.tracker_sync_v2($1,'[]') response", [other])).rows[0].response;
    assert.equal(isolated.snapshot.records.length, 0);
    const inaccessible = request("tracker", "update", { name: "attack" }, { serverId: id, baseVersion: 4 });
    assert.equal((await db.query("select public.tracker_sync_v2($1,$2::jsonb) response", [other, JSON.stringify([operation(inaccessible)])])).rows[0].response.results[0].status, "conflict");

  } finally { await db.close(); }
});
