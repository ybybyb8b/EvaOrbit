import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Optional isolated PostgreSQL engine; no project/runtime dependency or production credentials.
const modulePath = process.env.EVENTKIT_PGLITE_PATH;
test("EventKit migrations preserve baselines and Calendar RPC is atomic across reinstallations and isolated by account", { skip: modulePath ? false : "Set EVENTKIT_PGLITE_PATH to an isolated PGlite installation" }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const uid = "00000000-0000-4000-8000-000000000001", installation = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values('${uid}'),('00000000-0000-4000-8000-000000000003');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end; $$;
      create table public.tasks(id bigint primary key,user_id uuid);
      create table public.reminders(id bigint primary key,user_id uuid);
      grant select on public.tasks,public.reminders to authenticated;
      create table public.task_reminders(id bigint primary key);
    `);
    await db.exec(readFileSync("supabase/migrations/202609210003_calendar_events_eventkit.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/202610040001_eventkit_calendar_import.sql", "utf8");
    await db.exec(migration);
    await db.exec(`
      create function public.test_reject_mapping() returns trigger language plpgsql as $$ begin
        if current_setting('test.reject_mapping',true)='true' then raise exception 'mapping failure';end if;return new;
      end; $$;
      create trigger test_reject_mapping before insert on public.eventkit_links for each row execute function public.test_reject_mapping();
      set role authenticated;
      select set_config('test.uid','${uid}',false);
    `);
    const apple = { calendarItemIdentifier: "apple-1", externalIdentifier: "external-1", calendarIdentifier: "calendar", sourceIdentifier: "source" };
    const snapshot = { title: "Visit", notes: "", startAt: "2026-10-04T01:00:00.000Z", endAt: "2026-10-04T02:00:00.000Z", isAllDay: false, timezone: "Asia/Shanghai", location: "", status: "confirmed" };
    const call = (item = apple, targetInstallation = installation) => db.query("select public.import_eventkit_calendar_event($1::uuid,$2::jsonb,$3::jsonb,$4::text) as id", [targetInstallation, JSON.stringify(item), JSON.stringify(snapshot), "a".repeat(64)]);
    const count = async table => Number((await db.query(`select count(*) as count from public.${table}`)).rows[0].count);
    await db.exec("select set_config('test.reject_mapping','true',false)");
    await assert.rejects(call(), /mapping failure/);
    assert.equal(await count("calendar_events"), 0); assert.equal(await count("eventkit_links"), 0);
    await db.exec("select set_config('test.reject_mapping','false',false)");
    const id = (await call()).rows[0].id;
    assert.equal((await call()).rows[0].id, id);
    const simultaneous = await Promise.all([call(), call()]);
    assert.ok(simultaneous.every(result => result.rows[0].id === id));
    assert.equal(await count("calendar_events"), 1); assert.equal(await count("eventkit_links"), 1);
    assert.equal((await call({ ...apple, calendarItemIdentifier: "changed-id" })).rows[0].id, id, "external ID recovery reuses the original EO record");
    const originalBinding=(await db.query("select * from public.eventkit_links")).rows[0];
    const logicalMigration=readFileSync("supabase/migrations/202610050001_eventkit_logical_links.sql","utf8");
    await db.exec("reset role");
    await db.exec(readFileSync("supabase/migrations/202609300001_eventkit_reminder_domain_routes.sql","utf8"));
    await db.exec(logicalMigration); await db.exec(logicalMigration); await db.exec("set role authenticated");
    const migrated=(await db.query("select * from public.eventkit_links")).rows[0];
    assert.equal(migrated.eo_id,originalBinding.eo_id);assert.deepEqual(migrated.last_synced_snapshot,originalBinding.last_synced_snapshot);assert.equal(migrated.last_synced_hash,originalBinding.last_synced_hash);
    assert.equal(await count("eventkit_logical_links"),1);
    assert.equal(await count("calendar_events"), 1); assert.equal((await call()).rows[0].id, id);
    await db.exec("select set_config('test.uid','00000000-0000-4000-8000-000000000003',false)");
    assert.equal(await count("calendar_events"), 0); assert.equal(await count("eventkit_logical_links"),0); assert.notEqual((await call()).rows[0].id, id);
    await db.exec(`select set_config('test.uid','${uid}',false)`);
    assert.equal((await call()).rows[0].id, id);
    assert.equal((await call({...apple,calendarItemIdentifier:"new-device-id",calendarIdentifier:"new-calendar",sourceIdentifier:"new-source"}, "00000000-0000-4000-8000-000000000004")).rows[0].id, id, "account identity recovers across changed local identifiers");
    assert.equal(await count("calendar_events"),1);assert.equal(await count("eventkit_links"),2);assert.equal(await count("eventkit_logical_links"),1);
    await db.exec("select set_config('test.reject_mapping','true',false)");
    await assert.rejects(call({...apple,calendarItemIdentifier:"brand-new",externalIdentifier:"brand-new"}),/mapping failure/);
    assert.equal(await count("calendar_events"),1);assert.equal(await count("eventkit_logical_links"),1);
    await db.exec("select set_config('test.reject_mapping','false',false)");
    const fresh=(await call({...apple,calendarItemIdentifier:"brand-new",externalIdentifier:"brand-new"})).rows[0].id;
    assert.equal((await call({...apple,calendarItemIdentifier:"brand-new-2",externalIdentifier:"brand-new"},"00000000-0000-4000-8000-000000000005")).rows[0].id,fresh);
    await db.query("delete from public.eventkit_links where eo_id=$1",[fresh]);
    assert.equal((await call({...apple,calendarItemIdentifier:"brand-new-3",externalIdentifier:"brand-new"},"00000000-0000-4000-8000-000000000007")).rows[0].id,fresh,"Removing local bindings preserves the account's Apple identity");
    // Stable reservations survive retries; another account cannot reserve this user's Task.
    await db.exec(`reset role;insert into public.tasks values(101,'${uid}');set role authenticated`);
    const reserve=()=>db.query("select (public.reserve_eventkit_link('task',101,'reminder',$1::jsonb,$2::text)).*",[JSON.stringify({title:"Mirror"}),"b".repeat(64)]);
    const reserved=(await reserve()).rows[0];assert.equal((await reserve()).rows[0].recovery_token,reserved.recovery_token);
    const prepare=lease=>db.query("select (public.reserve_eventkit_link('task',101,'reminder',$1::jsonb,$2::text,false,true,$3::uuid)).*",[JSON.stringify({title:"Mirror"}),"b".repeat(64),lease]);
    await prepare(installation);
    await assert.rejects(prepare("00000000-0000-4000-8000-000000000006"),/creation in progress/);
    assert.equal((await prepare(installation)).rows[0].recovery_token,reserved.recovery_token);
    await db.exec("select set_config('test.uid','00000000-0000-4000-8000-000000000003',false)");
    await assert.rejects(reserve(),/Invalid EventKit logical link/);
    await db.exec(`reset role;select set_config('test.uid','${uid}',false);`);
    // Simulate historical duplicate associations. Reapplying migration reports both, never cleans them up.
    for(const suffix of ["a","b"]){
      await db.query(`with event as (
        insert into public.calendar_events(user_id,title,notes,start_at,end_at,is_all_day) values($1::uuid,'Suspect','', '2026-10-05','2026-10-06',true) returning id
      ),logical as (
        insert into public.eventkit_logical_links(user_id,entity_type,eo_id,eventkit_entity_type,initial_snapshot,initial_hash)
          select $1::uuid,'calendar_event',id,'event',$2::jsonb,$3::text from event returning *
      )insert into public.eventkit_links(user_id,installation_id,logical_link_id,entity_type,eo_id,eventkit_entity_type,calendar_item_identifier,external_identifier,calendar_identifier,source_identifier,last_synced_hash,last_synced_snapshot)
        select $1::uuid,$4::uuid,id,'calendar_event',eo_id,'event',$5,'suspected-duplicate','calendar','source',$3::text,$2::jsonb from logical`,[uid,JSON.stringify(snapshot),"a".repeat(64),installation,`suspect-${suffix}`]);
    }
    const recordsBefore=(await db.query("select id from public.calendar_events order by id")).rows;
    await db.exec(logicalMigration);
    assert.deepEqual((await db.query("select id from public.calendar_events order by id")).rows,recordsBefore);
    await db.exec("set role authenticated");
    const suspects=(await db.query("select * from public.eventkit_identity_conflicts where external_identifier='suspected-duplicate'")).rows;
    assert.equal(suspects.length,1);assert.equal(suspects[0].eo_ids.length,2);
    await assert.rejects(call({...apple,calendarItemIdentifier:"suspect-new",externalIdentifier:"suspected-duplicate"}),/Ambiguous EventKit identity/);
  } finally { await db.close(); }
});
