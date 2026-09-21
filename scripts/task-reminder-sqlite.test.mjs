import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("Task Due and Reminder stay independent across the service lifecycle",()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),"evaorbit-task-reminder-")),databasePath=path.join(directory,"test.db");
  const program=`
    const task=await import("./src/lib/services/task.ts");
    const reminder=await import("./src/lib/services/reminder.ts");
    const db=await import("./src/lib/db.ts");
    const base={notes:"",priority:"medium",tags:[],reminderDate:null,reminderTime:null,repeatWhileOverdue:false,timezone:"Asia/Shanghai"};
    const none=await task.createTask({...base,title:"none",dueDate:null,dueTime:null,reminderMode:"none"});
    const dated=await task.createTask({...base,title:"date",dueDate:"2026-09-21",dueTime:null,reminderMode:"none"});
    const atDue=await task.createTask({...base,title:"at due",dueDate:"2026-09-21",dueTime:"18:00",reminderMode:"at_due"});
    const custom=await task.createTask({...base,title:"custom",dueDate:null,dueTime:null,reminderMode:"custom",reminderDate:"2026-09-25",reminderTime:"13:07"});
    const before=atDue.reminders[0],beforeProjection=db.getReminder(before.reminderId);
    const moved=await task.updateTask(atDue.id,{dueDate:"2026-09-22"});
    const movedProjection=db.getReminder(moved.reminders[0].reminderId);
    const snoozed=await reminder.snoozeReminder(movedProjection.id,"custom","2026-09-22T11:30:00.000Z",new Date("2026-09-20T00:00:00.000Z"));
    const afterSnooze=await task.getTask(atDue.id);
    const done=await task.updateTask(atDue.id,{completed:true});
    const doneProjection=db.getReminder(done.reminders[0].reminderId);
    const reopened=await task.updateTask(atDue.id,{completed:false});
    const reopenedProjection=db.getReminder(reopened.reminders[0].reminderId);
    const customProjection=db.getReminder(custom.reminders[0].reminderId);
    await task.deleteTask(custom.id);
    console.log(JSON.stringify({none:none.reminders.length,dated:dated.reminders.length,before:beforeProjection.nextDueAt,moved:movedProjection.nextDueAt,dueAfterSnooze:afterSnooze.dueTime,snoozedUntil:snoozed.snoozedUntil,doneActive:doneProjection.isActive,reopenedActive:reopenedProjection.isActive,reopenedSnooze:reopenedProjection.snoozedUntil,customMinute:customProjection.nextDueAt,deletedRule:db.getTaskReminder(custom.reminders[0].id),deletedProjection:db.getReminder(customProjection.id)}));
  `;
  try{
    const loader=pathToFileURL(path.join(process.cwd(),"scripts","typescript-test-loader.mjs")).href;
    const result=spawnSync(process.execPath,["--conditions=react-server","--experimental-loader",loader,"--input-type=module","--eval",program],{cwd:process.cwd(),encoding:"utf8",env:{...process.env,NODE_ENV:"development",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath,VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const value=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(value.none,0);assert.equal(value.dated,0);
    assert.notEqual(value.before,value.moved);assert.equal(value.dueAfterSnooze,"18:00");assert.ok(value.snoozedUntil);
    assert.equal(value.doneActive,false);assert.equal(value.reopenedActive,true);assert.equal(value.reopenedSnooze,null);
    assert.match(value.customMinute,/05:07:00\.000Z$/);assert.equal(value.deletedRule,null);assert.equal(value.deletedProjection,null);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
