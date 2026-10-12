import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("persisted Cat Routine repeats stage while Apple owns the initial alert and advance on completion",()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),"eo-routine-repeat-"));
  try{
    const program=`
      const routine=await import("./src/lib/services/cat-routine.ts"),reminders=await import("./src/lib/services/reminder.ts"),db=await import("./src/lib/db.ts"),engine=await import("./src/lib/reminder-engine.ts"),native=await import("./src/lib/native-notifications.ts");
      const item=await routine.createCatRoutine({scope:"household",petId:null,title:"Clean bowl",intervalValue:2,intervalUnit:"day",recurrenceMode:"completion",anchorDate:"2099-10-01",firstDueDate:"2099-10-01",nextDueDate:"2099-10-01",configuredReminderTime:"23:00",timezone:"Asia/Shanghai",firstDueAt:"2099-10-01T15:00:00.000Z",nextDueAt:"2099-10-01T15:00:00.000Z",lastCompletedAt:null,reminderLeadMinutes:0,repeatWhileOverdue:true,notes:"",enabled:true,reminderId:null});
      const projection=db.getReminder(item.reminderId),slot=engine.notificationDeliverySlot(projection,new Date("2099-10-02T15:00:00Z"));
      db.updateReminder(item.reminderId,{deliveryChannel:"apple_reminders"});
      const now=new Date("2099-09-30T12:00:00Z"),upcoming=await reminders.listScheduledNotifications(now),scheduled=native.buildNativeNotificationSchedules({upcoming,now});
      await routine.completeCatRoutine(item.id,new Date("2099-10-02T15:01:00Z"));
      const advanced=db.getReminder(item.reminderId);
      await routine.archiveCatRoutine(item.id);
      const disabled=db.getReminder(item.reminderId);
      console.log(JSON.stringify({boundary:projection.overdueAfter,slot,staged:scheduled.map(i=>i.triggerAt),advanced:advanced.nextDueAt,repeat:advanced.repeatWhileOverdue,disabled:native.nativeReminderNotifications({...disabled,scheduledAt:disabled.nextDueAt},"en",now).length}));
    `;
    const result=spawnSync(process.execPath,["--conditions=react-server","--experimental-loader",pathToFileURL(path.join(process.cwd(),"scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",program],{cwd:process.cwd(),encoding:"utf8",env:{...process.env,NODE_ENV:"development",VERCEL:"",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db")}});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const value=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(value.boundary,null);assert.equal(value.slot,"2099-10-02T15:00:00.000Z");
    assert.equal(value.staged.length,5);assert.equal(value.staged[0],"2099-10-02T15:00:00.000Z");
    assert.equal(value.advanced,"2099-10-04T15:00:00.000Z");assert.equal(value.repeat,true);assert.equal(value.disabled,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
