import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

test("SQLite papers are durable, opt-in, deduplicated and atomic with task reminders", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eo-eva-"));
  try {
    const run = spawnSync(process.execPath, ["--experimental-loader", pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href, "--input-type=module", "--eval", `
      import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
      import {getRepository} from './src/lib/repositories/index.ts';
      import {processEvaPaper} from './src/lib/services/eva.ts';
      import {createSupabaseEvaStore} from './src/lib/repositories/eva-supabase.ts';
      const repo=await getRepository(),store=repo.eva,sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const task={title:'取快递',notes:'',dueDate:'2026-11-05',dueTime:'15:00',remind:true,review:false,evidence:'明天下午三点提醒我取快递',dateEvidence:'明天',timeEvidence:'下午三点',reminderEvidence:'提醒我'};
      const result={summary:'创建待办',remaining:'',review:false,tasks:[task]};
      const key=randomUUID(),held=await store.capture(key,'明天下午三点提醒我取快递',true);
      assert.equal(held.status,'held');assert.equal((await store.capture(key,held.content,true)).inboxId,held.inboxId);
      await store.settings({enabled:true});assert.equal((await store.get(key)).status,'held','enabling never scans old papers');
      await store.decide(key,'retry');const lease=randomUUID();assert(await store.claim(key,lease));assert.equal(await store.claim(key,randomUUID()),null);
      sql.exec("CREATE TRIGGER reject_eva BEFORE INSERT ON reminders BEGIN SELECT RAISE(ABORT,'injected'); END");
      await assert.rejects(store.finish(key,lease,result),/injected/);assert.equal((await repo.listTasks()).length,0);
      sql.exec('DROP TRIGGER reject_eva');await store.finish(key,lease,result);
      const tasks=await repo.listTasks();assert.equal(tasks.length,1);assert.equal(tasks[0].dueTime,'15:00');assert.equal((await repo.listTaskReminders(tasks[0].id)).length,1);
      await assert.rejects(store.finish(key,lease,result));assert.equal((await repo.listTasks()).length,1);
      const mixed=await store.capture(randomUUID(),'取快递；也许整理房间',true),token=randomUUID();await store.claim(mixed.id,token);
      const mixedResult={...result,remaining:'也许整理房间',tasks:[{...task,remind:false,dueDate:null,dueTime:null},{...task,title:'整理房间',review:true}]};
      const review=await store.finish(mixed.id,token,mixedResult);assert.equal(review.status,'review');const before=(await repo.listTasks()).length;
      await store.decide(mixed.id,'approve');assert.equal((await repo.listTasks()).length,before+1,'approval cannot duplicate already-created tasks');
      const stopped=await store.capture(randomUUID(),'取快递',true),stopLease=randomUUID();await store.claim(stopped.id,stopLease);await store.settings({enabled:false});
      assert.equal((await store.finish(stopped.id,stopLease,result)).status,'held');assert.equal((await repo.listTasks()).length,before+1);
      // Exercise the real worker with a synthetic Provider: single request, no tools/history; unknown costs remain unknown.
      await store.settings({enabled:true});await store.decide(stopped.id,'retry');let count=0;
      const runtime=await repo.getAiRuntimeSettings();
      const fakeRepo={...repo,getAiRuntimeSettings:async()=>({...runtime,enabled:true,model:'fixture',baseUrl:'https://fixture.invalid/v1',apiKey:'fixture'})};
      const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{count++;const body=JSON.parse(init.body);assert.equal(body.tools,undefined);assert.equal(body.messages.length,2);assert.equal(body.stream,false);return Response.json({choices:[{message:{content:JSON.stringify({...result,tasks:[{...task,dueDate:null,dueTime:null,remind:false,evidence:'取快递'}]})}}],usage:{prompt_tokens:120,completion_tokens:50,prompt_cache_hit_tokens:64}});};
      try{await processEvaPaper(fakeRepo,stopped.id);}finally{globalThis.fetch=original;}
      assert.equal(count,1);assert.equal((await store.get(stopped.id)).status,'done');assert.equal((await store.calls())[0].input,120);
      const successful=await store.latestCall(stopped.id);assert.equal(successful.feedback.stage,'save');assert(successful.feedback.repliedAt);assert(successful.feedback.respondedAt);
      const rejected=await store.capture(randomUUID(),'取快递',true);globalThis.fetch=async()=>{const active=await store.latestCall(rejected.id);assert.equal(active.feedback.stage,'request');assert.equal(active.feedback.respondedAt,undefined);return Response.json({error:{message:'Invalid Bearer sk-secret-privatekey; fixture credential rejected'}},{status:401,headers:{'x-request-id':'test-request'}});};
      try{await processEvaPaper(fakeRepo,rejected.id);}finally{globalThis.fetch=original;}
      const denied=await store.latestCall(rejected.id);assert.equal(denied.feedback.httpStatus,401);assert.equal(denied.feedback.failure.code,'authentication');assert(!denied.feedback.failure.message.includes('fixture'));assert(!denied.feedback.failure.message.includes('sk-secret-privatekey'));assert.equal((await store.get(rejected.id)).status,'failed');
      const timeout=await store.capture(randomUUID(),'取快递',true);globalThis.fetch=async()=>{throw new DOMException('Request timed out','TimeoutError');};
      try{await processEvaPaper(fakeRepo,timeout.id);}finally{globalThis.fetch=original;}
      const timed=await store.latestCall(timeout.id);assert.equal(timed.feedback.failure.code,'timeout');assert.equal(timed.feedback.respondedAt,undefined);
      const invalid=await store.capture(randomUUID(),'取快递',true);globalThis.fetch=async()=>Response.json({choices:[{message:{content:'not JSON'}}]});
      try{await processEvaPaper(fakeRepo,invalid.id);}finally{globalThis.fetch=original;}
      const malformed=await store.latestCall(invalid.id);assert.equal(malformed.feedback.failure.code,'parse');assert(malformed.feedback.repliedAt);assert.equal((await store.get(invalid.id)).status,'failed');
      const unconfigured=await store.capture(randomUUID(),'取快递',true);let requested=false;globalThis.fetch=async()=>{requested=true;throw Error('must not request');};
      try{await processEvaPaper({...fakeRepo,getAiRuntimeSettings:async()=>({...runtime,enabled:false})},unconfigured.id);}finally{globalThis.fetch=original;}
      assert.equal(requested,false);assert.equal((await store.latestCall(unconfigured.id)).feedback.failure.code,'configuration');
      const remote=createSupabaseEvaStore({rpc:async()=>({error:{code:'22P02',message:'malformed array literal',details:'private database detail'}})});
      await assert.rejects(remote.finish(key,lease,result),error=>error.databaseCode==='22P02'&&error.message==='malformed array literal');
      const unsaved=await store.capture(randomUUID(),'取快递',true);globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({...result,tasks:[]})}}]});
      try{await processEvaPaper({...fakeRepo,eva:{...store,finish:async()=>{throw Object.assign(Error('Database refused fixture credential'),{databaseCode:'22P02'});}}},unsaved.id);}finally{globalThis.fetch=original;}
      const saveFailure=(await store.latestCall(unsaved.id)).feedback.failure;assert.equal(saveFailure.code,'save');assert.equal(saveFailure.databaseCode,'22P02');assert(saveFailure.message.includes('Database refused'));assert(!saveFailure.message.includes('fixture'));
      sql.close();
    `], { encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db"), VERCEL: "" } });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("Postgres paper RPC isolates owners and atomically creates task/reminder results", async () => {
  const db = new PGlite(), owner = randomUUID(), other = randomUUID();
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      set test.uid='${owner}';
      create table inbox_items(id bigserial primary key,user_id uuid,content text,source text,status text default 'inbox',processed_at timestamptz);
      create table tasks(id bigserial primary key,user_id uuid,title text,notes text,due_date date,due_time time,priority text,tags text[] not null default '{}',reminder_id bigint);
      create table task_reminders(id bigserial primary key,user_id uuid,task_id bigint,reminder_id bigint,trigger_type text,relative_to text,offset_minutes int,timezone text,repeat_while_overdue boolean);
      create table reminders(id bigserial primary key,user_id uuid,title text,target_type text,target_id bigint,source_type text,source_id bigint,schedule_type text,starts_at timestamptz,next_due_at timestamptz,timezone text,note text,lead_time_minutes int,repeat_while_overdue boolean,status text,is_active boolean,due_has_explicit_time boolean,overdue_after timestamptz);
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
      grant select,insert,update,delete on inbox_items,tasks,task_reminders,reminders to authenticated;grant usage,select on all sequences in schema public to authenticated;
    `);
    await db.exec(readFileSync("supabase/migrations/202611040005_eva_workbench.sql", "utf8"));
    const command = async (action, input = {}) => (await db.query("select eva_command($1,$2::jsonb) as result", [action, JSON.stringify(input)])).rows[0].result;
    await db.exec("set role authenticated");
    await command("settings", { enabled: true });
    const key = randomUUID(), token = randomUUID(), capture = { key, content: "明天下午三点提醒我取快递", process: true };
    const paper = await command("capture", capture);assert.equal((await command("capture", capture)).inbox_id, paper.inbox_id);
    assert(await command("claim", { id: key, lease: token }));assert.equal(await command("claim", { id: key, lease: randomUUID() }), null);
    const task = { title: "取快递", notes: "", dueDate: "2026-11-05", dueTime: "15:00", remind: true, review: false };
    const result = { summary: "创建待办", remaining: "", review: false, tasks: [task] };
    await assert.rejects(command("finish", { id: key, lease: token, result }), /malformed array literal/);
    assert.equal((await db.query("select count(*)::int as n from tasks")).rows[0].n, 0, "failed result is fully rolled back");
    await db.exec("reset role");
    await db.exec(readFileSync("supabase/migrations/202611050001_eva_task_tags_default.sql", "utf8"));
    await db.exec("set role authenticated");
    const done = await command("finish", { id: key, lease: token, result });assert.equal(done.status, "done");
    assert.deepEqual((await db.query("select tags from tasks")).rows[0].tags, [], "task uses the real Postgres text-array default");
    assert.equal((await db.query("select count(*)::int as n from tasks")).rows[0].n, 1);
    const reminders = (await db.query("select * from reminders")).rows;assert.equal(reminders.length, 1);assert.equal(new Date(reminders[0].next_due_at).toISOString(), "2026-11-05T07:00:00.000Z");
    await assert.rejects(command("finish", { id: key, lease: token, result }), /EVA_LEASE/);
    await db.exec(`set test.uid='${other}'`);assert.equal(await command("get", { id: key }), null);assert.equal((await command("list")).length, 0);
    assert.equal((await db.query("select count(*)::int as n from eva_jobs")).rows[0].n, 0, "RLS applies even to direct table reads");
    await db.exec(`set test.uid='${owner}'`);
    const mixedKey = randomUUID(), mixedToken = randomUUID();await command("capture", { key: mixedKey, content: "取快递和整理房间", process: true });await command("claim", { id: mixedKey, lease: mixedToken });
    await command("finish", { id: mixedKey, lease: mixedToken, result: { ...result, tasks: [{ ...task, remind: false, dueDate: null, dueTime: null }, { ...task, title: "整理房间", review: true }] } });
    await command("decide", { id: mixedKey, action: "approve" });assert.equal((await db.query("select count(*)::int as n from tasks")).rows[0].n, 3);
  } finally { await db.close(); }
});
