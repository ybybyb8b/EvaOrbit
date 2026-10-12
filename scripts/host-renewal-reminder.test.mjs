import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { hostRenewalSchedule, updateHostRenewalReminder } from "./ios/host-renewal-reminder.mjs";

test("Host renewal is six days after successful installation and retry keeps the same deadline",()=>{
  const schedule=hostRenewalSchedule("2026-10-12T15:59:48Z");
  assert.equal(schedule.remindAt,"2026-10-18T15:59:00.000Z");
  assert.equal(schedule.estimatedExpiresAt,"2026-10-19T15:59:48.000Z");
  assert.equal(schedule.date,"2026-10-18");assert.equal(schedule.time,"23:59");
  assert.deepEqual(hostRenewalSchedule(schedule.installedAt),schedule);
  assert.throws(()=>hostRenewalSchedule("invalid"));
});

test("Host renewal updates one task and projection atomically, preserves Apple ownership and isolates accounts",{skip:process.env.EVENTKIT_PGLITE_PATH?false:"Set EVENTKIT_PGLITE_PATH for isolated SQL validation"},async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.EVENTKIT_PGLITE_PATH).href),db=new PGlite();
  try{
    await db.exec(`
      create schema auth;create table auth.users(id uuid primary key,email text);
      insert into auth.users values('00000000-0000-4000-8000-000000000001','one@example.test');
      create table tasks(id bigint generated always as identity primary key,user_id uuid,title text,notes text,completed boolean default false,completed_at timestamptz,due_date date,due_time time,priority text,tags text[],reminder_id bigint);
      create table task_reminders(id bigint generated always as identity primary key,user_id uuid,task_id bigint,reminder_id bigint,trigger_type text,relative_to text,offset_minutes int,absolute_date date,absolute_time time,timezone text,repeat_while_overdue boolean,delivery_channel text default 'pwa');
      create table reminders(id bigint generated always as identity primary key,user_id uuid,title text,target_type text,target_id bigint,source_type text,source_id bigint,schedule_type text,starts_at timestamptz,next_due_at timestamptz,overdue_after timestamptz,due_has_explicit_time boolean,timezone text,note text,lead_time_minutes int,repeat_while_overdue boolean,status text,is_active boolean,snoozed_until timestamptz,last_notified_at timestamptz,sent_at timestamptz,cancelled_at timestamptz,last_completed_at timestamptz);
    `);
    const tx=async(strings,...values)=>(await db.query(strings.reduce((s,part,i)=>s+(i?`$${i}`:"")+part,""),values.map(v=>Array.isArray(v)?`{${v.map(x=>JSON.stringify(x)).join(",")}}`:v))).rows;
    const sql={begin:async run=>{await db.exec("begin");try{const value=await run(tx);await db.exec("commit");return value;}catch(error){await db.exec("rollback");throw error;}}};
    const first=await updateHostRenewalReminder(sql,hostRenewalSchedule("2026-10-12T01:00:00Z"));
    await db.exec("update tasks set completed=true;update task_reminders set delivery_channel='apple_reminders'");
    const second=await updateHostRenewalReminder(sql,hostRenewalSchedule("2026-10-13T02:00:00Z"));
    assert.equal(first.taskId,second.taskId);
    assert.equal((await db.query("select count(*)::int as n from tasks")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int as n from reminders")).rows[0].n,1);
    const task=(await db.query("select * from tasks")).rows[0],rule=(await db.query("select * from task_reminders")).rows[0];
    assert.equal(task.completed,false);assert.equal(rule.delivery_channel,"apple_reminders");assert.equal(task.reminder_id,rule.reminder_id);
    assert.equal(new Date((await db.query("select next_due_at from reminders")).rows[0].next_due_at).toISOString(),second.remindAt);
    await db.exec("insert into auth.users values('00000000-0000-4000-8000-000000000002','two@example.test')");
    await assert.rejects(updateHostRenewalReminder(sql,hostRenewalSchedule("2026-10-14T02:00:00Z")),/identify one EO account/);
    const other=await updateHostRenewalReminder(sql,hostRenewalSchedule("2026-10-14T02:00:00Z"),"two@example.test");assert.notEqual(other.taskId,first.taskId);
    await db.exec("insert into task_reminders(user_id,task_id) select user_id,id from tasks where id="+first.taskId);
    const before=(await db.query("select notes from tasks where id="+first.taskId)).rows;
    await assert.rejects(updateHostRenewalReminder(sql,hostRenewalSchedule("2026-10-15T02:00:00Z"),"one@example.test"),/multiple rules/);
    assert.deepEqual((await db.query("select notes from tasks where id="+first.taskId)).rows,before);
  }finally{await db.close();}
});
