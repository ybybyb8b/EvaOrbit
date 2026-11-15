import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";

test("routine completion deduplicates retries, competing requests and stale Apple occurrences across midnight",()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),"eo-cat-completion-"));
 try {
  const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",`
   import assert from "node:assert/strict";
   import {DatabaseSync} from "node:sqlite";
   import {createPet,correctCatCompletion,undoCatRoutineCompletion} from "./src/lib/services/cats.ts";
   import {createCatRoutine,completeCatRoutine} from "./src/lib/services/cat-routine.ts";
   import {completeReminder} from "./src/lib/services/reminder.ts";
   import {parsePet,parseCatRoutine} from "./src/lib/cats-validation.ts";
   import {getRepository} from "./src/lib/repositories/index.ts";
   const pet=await createPet(parsePet({name:"Test cat"})),repo=await getRepository();
   const routine=await createCatRoutine(parseCatRoutine({scope:"cat",petId:pet.id,title:"上药",intervalValue:1,intervalUnit:"day",firstDueDate:"2026-11-03",configuredReminderTime:"23:00",timezone:"Asia/Shanghai"}));
   const expected={expectedNextDueAt:routine.nextDueAt,expectedLastCompletedAt:null};
   const first=new Date("2026-11-03T16:39:17.755Z"),retry=new Date("2026-11-03T16:41:33.788Z");
   const results=await Promise.all([completeCatRoutine(routine.id,first,expected),completeReminder(routine.reminderId,first,expected)]);
   assert.equal((await repo.listCatEvents(pet.id)).length,1);
   assert.equal((await repo.getCatRoutine(routine.id)).nextDueDate,"2026-11-04");
   await completeReminder(routine.reminderId,retry);
   assert.equal((await repo.listCatEvents(pet.id)).length,1,"legacy clients are protected beyond 30 seconds");
   // Even a delayed old request on a later day must not complete the new occurrence.
   await completeReminder(routine.reminderId,new Date("2026-11-04T15:01:00Z"),expected);
   assert.equal((await repo.listCatEvents(pet.id)).length,1);
   const current=await repo.getCatRoutine(routine.id);
   await completeCatRoutine(routine.id,new Date("2026-11-04T15:01:00Z"),{expectedNextDueAt:current.nextDueAt,expectedLastCompletedAt:current.lastCompletedAt});
   assert.equal((await repo.listCatEvents(pet.id)).length,2,"a fresh next occurrence remains completable");
   assert.equal((await repo.getCatRoutine(routine.id)).nextDueDate,"2026-11-05");
   await assert.rejects(completeCatRoutine(routine.id,new Date(),{expectedNextDueAt:"bad"}),/Invalid completion occurrence/);
   // A failed reminder write rolls back the event and routine, allowing a safe retry.
   const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   sql.exec("CREATE TRIGGER reject_completion BEFORE UPDATE ON reminders BEGIN SELECT RAISE(ABORT,'injected failure'); END");
   await assert.rejects(completeCatRoutine(routine.id,new Date("2026-11-05T15:00:00Z")),/injected failure/);
   assert.equal((await repo.listCatEvents(pet.id)).length,2);
   assert.equal((await repo.getCatRoutine(routine.id)).nextDueDate,"2026-11-05");
   sql.exec("DROP TRIGGER reject_completion");sql.close();
   await completeCatRoutine(routine.id,new Date("2026-11-05T15:00:00Z"));
   assert.equal((await repo.listCatEvents(pet.id)).length,3);
   const occurrences=await repo.listReminderOccurrences({from:"2026-11-03T00:00:00Z",to:"2026-11-07T00:00:00Z"});
   assert.equal(occurrences.filter(item=>item.reminderId===routine.reminderId).length,3);
   const events=await repo.listCatEvents(pet.id);
   const latestEventId=(await repo.getCatRoutine(routine.id)).undoableEventId;
   const latest=events.find(event=>event.id===latestEventId);
   assert.equal(latest.occurredHasExplicitTime,false);
   await assert.rejects(undoCatRoutineCompletion(routine.id,events.at(-1).id),/无法撤销/);
   await correctCatCompletion(events.at(-1).id,"2026-11-02");
   assert.equal((await repo.getCatRoutine(routine.id)).nextDueDate,"2026-11-06","editing an older record keeps the current cycle");
   await undoCatRoutineCompletion(routine.id,latest.id);
   assert.equal((await repo.getCatRoutine(routine.id)).nextDueDate,"2026-11-05");
   assert.equal(await repo.getCatEvent(latest.id),null);
   assert.equal((await repo.listReminderOccurrences({from:"2026-11-05T00:00:00Z",to:"2026-11-06T00:00:00Z"})).length,0);
   const another=await createCatRoutine(parseCatRoutine({scope:"cat",petId:pet.id,title:"清洁",intervalValue:7,intervalUnit:"day",firstDueDate:"2026-11-04",configuredReminderTime:"10:00"}));
   const done=await completeCatRoutine(another.id,new Date("2026-11-05T10:00:00Z"));
   assert.equal(done.routine.nextDueDate,"2026-11-12");
   await correctCatCompletion(done.event.id,"2026-11-04");
   assert.equal((await repo.getCatRoutine(another.id)).nextDueDate,"2026-11-11");
   assert.equal((await repo.getReminder(another.reminderId)).nextDueAt,"2026-11-11T02:00:00.000Z");
   await undoCatRoutineCompletion(another.id,done.event.id);
   assert.equal((await repo.getCatRoutine(another.id)).nextDueDate,"2026-11-04");
  `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),VERCEL:""}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test("Postgres completion migration preserves history, rejects stale/cross-account claims and rolls back failures",async()=>{
 const db=new PGlite();const owner="00000000-0000-4000-8000-000000000001";
 try {
  await db.exec(`
   create schema auth;create role anon;create role authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   set test.uid='${owner}';
   create table cat_routines(id bigint primary key,user_id uuid,scope text,pet_id bigint,title text,notes text,enabled boolean,reminder_id bigint,next_due_at timestamptz,last_completed_at timestamptz,anchor_date date,next_due_date date,updated_at timestamptz);
   create table cat_events(id bigserial primary key,user_id uuid,pet_id bigint,event_type text,occurred_at timestamptz,occurred_has_explicit_time boolean,title text,note text,source_type text,source_id bigint);
   create table reminders(id bigint primary key,user_id uuid,next_due_at timestamptz,last_completed_at timestamptz,status text,sent_at timestamptz,cancelled_at timestamptz,snoozed_until timestamptz,last_notified_at timestamptz,is_active boolean,updated_at timestamptz);
   create table reminder_occurrences(id bigserial primary key,user_id uuid,reminder_id bigint references reminders,action text,scheduled_for timestamptz,acted_at timestamptz,created_event_id bigint references cat_events);
   insert into reminders(id,user_id,next_due_at) values(27,'${owner}','2026-11-03T15:00:00Z');
   insert into cat_routines values(5,'${owner}','cat',2,'上药','',true,27,'2026-11-03T15:00:00Z',null,'2026-11-02','2026-11-03',now());
   insert into cat_events(title) values('existing history');
  `);
  const migration=readFileSync("supabase/migrations/202611040004_cat_routine_completion.sql","utf8");
  await db.exec(migration);await db.exec(migration);
  const claim=()=>db.query("select complete_cat_routine_occurrence(5,'2026-11-03T15:00:00Z',null,'2026-11-03T16:39:17Z','2026-11-03','2026-11-04','2026-11-04T15:00:00Z') as result");
  const results=await Promise.all([claim(),claim()]);
  assert.equal(results.filter(r=>r.rows[0].result!==null).length,1);
  assert.equal((await db.query("select count(*)::int as n from cat_events")).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int as n from reminder_occurrences")).rows[0].n,1);
  await db.exec("set test.uid='00000000-0000-4000-8000-000000000002'");
  assert.equal((await claim()).rows[0].result,null);
  await db.exec(`set test.uid='${owner}';create function reject_reminder() returns trigger language plpgsql as $$begin raise exception 'injected failure';end$$;create trigger reject_reminder before update on reminders for each row execute function reject_reminder();`);
  await assert.rejects(db.query("select complete_cat_routine_occurrence(5,'2026-11-04T15:00:00Z','2026-11-03T16:39:17Z','2026-11-04T15:01:00Z','2026-11-04','2026-11-05','2026-11-05T15:00:00Z')"),/injected failure/);
  assert.equal((await db.query("select count(*)::int as n from cat_events")).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int as n from reminder_occurrences")).rows[0].n,1);
  assert.equal((await db.query("select next_due_date::text as d from cat_routines")).rows[0].d,"2026-11-04");
  await db.exec(`
    drop trigger reject_reminder on reminders;
    create table tasks(id bigint primary key,user_id uuid);
    alter table cat_routines add column recurrence_mode text default 'completion',add column interval_value integer default 1,
      add column interval_unit text default 'day',add column configured_reminder_time time default '23:00',add column timezone text default 'Asia/Shanghai';
    alter table cat_events add column created_at timestamptz default now(),add column updated_at timestamptz default now();
    update reminders set snoozed_until='2026-11-04T16:30:00Z';
  `);
  const completionDates=readFileSync("supabase/migrations/202611110001_completion_dates.sql","utf8");
  await db.exec(completionDates);
  assert.equal((await db.query("select occurred_has_explicit_time from cat_events where source_type='cat_routine'")).rows[0].occurred_has_explicit_time,false);
  const newClaim=()=>db.query("select complete_cat_routine_occurrence(5,'2026-11-04T15:00:00Z','2026-11-03T16:39:17Z','2026-11-05T15:01:00Z','2026-11-05','2026-11-06','2026-11-06T15:00:00Z','2026-11-05','2026-11-05T04:00:00Z','2026-11-03') as result");
  const claims=await Promise.all([newClaim(),newClaim()]);
  assert.equal(claims.filter(claim=>claim.rows[0].result).length,1);
  const result=claims.find(claim=>claim.rows[0].result).rows[0].result;
  const eventId=result.event.id;
  assert.equal(result.event.occurred_has_explicit_time,false);
  assert.equal(result.routine.last_completed_on,"2026-11-05");
  const correction={completedOn:"2026-11-04",occurredAt:"2026-11-04T04:00:00Z",occurredHasExplicitTime:false};
  const edit=()=>db.query("select change_cat_completion($1,$2::jsonb) as result",[eventId,JSON.stringify(correction)]);
  const undo=()=>db.query("select change_cat_completion($1,null) as result",[eventId]);
  await db.exec("set test.uid='00000000-0000-4000-8000-000000000002'");
  assert.equal((await edit()).rows[0].result,null);
  assert.equal((await undo()).rows[0].result,null);
  await db.exec(`set test.uid='${owner}'`);
  assert.equal((await edit()).rows[0].result.id,eventId);
  assert.equal((await db.query("select next_due_date::text as d from cat_routines")).rows[0].d,"2026-11-05");
  assert.equal((await db.query("select completed_on::text as d from reminder_occurrences where created_event_id=$1",[eventId])).rows[0].d,"2026-11-04");
  assert.equal((await undo()).rows[0].result.id,eventId);
  assert.equal((await db.query("select next_due_date::text as d from cat_routines")).rows[0].d,"2026-11-04");
  assert.equal((await db.query("select count(*)::int as n from reminder_occurrences")).rows[0].n,1);
  assert.equal((await db.query("select snoozed_until from reminders")).rows[0].snoozed_until.toISOString(),"2026-11-04T16:30:00.000Z");
  const standalone=await db.query("insert into reminder_occurrences(user_id,reminder_id,action,scheduled_for,acted_at,completed_on) values($1,27,'completed','2026-11-04T15:00:00Z','2026-11-05T15:00:00Z','2026-11-05') returning id",[owner]);
  const occurrenceId=standalone.rows[0].id;
  const move=()=>db.query("select correct_reminder_completion(27,$1,'2026-11-04',null) as saved",[occurrenceId]);
  await db.exec("set test.uid='00000000-0000-4000-8000-000000000002'");
  assert.equal((await move()).rows[0].saved,false);
  await db.exec(`set test.uid='${owner}'`);
  assert.equal((await move()).rows[0].saved,true);
  assert.equal((await db.query("select completed_on::text as d from reminder_occurrences where id=$1",[occurrenceId])).rows[0].d,"2026-11-04");
 }finally{await db.close();}
});
