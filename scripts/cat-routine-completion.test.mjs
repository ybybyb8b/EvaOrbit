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
   import {createPet} from "./src/lib/services/cats.ts";
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
 }finally{await db.close();}
});
