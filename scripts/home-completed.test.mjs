import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Home reads actual completion dates across modules, persists them, excludes skips and permits only audited reads",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-home-completed-"));
 try {
  const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
   import assert from 'node:assert/strict';
   import * as db from './src/lib/db.ts';
   import {getHomeDayOverview} from './src/lib/services/home-day.ts';
   import {withHomeReadOnlyRepository} from './src/lib/repositories/index.ts';
   import {completeReminder,skipReminder} from './src/lib/services/reminder.ts';
   import {dateRange} from './src/lib/time.ts';
   const task=db.createTask({title:'Undated completed task',notes:'',dueDate:null,dueTime:null,priority:'medium',tags:[]});
   db.updateTask(task.id,{completed:true,completedAt:'2026-10-28T16:10:00.000Z'});
   const old=db.createTask({title:'Overdue completed task',notes:'',dueDate:'2026-10-27',dueTime:'09:00',priority:'medium',tags:[]});
   db.updateTask(old.id,{completed:true,completedAt:'2026-10-29T01:00:00.000Z'});
   const input={title:'Clean litter box',targetType:'cat_household',targetId:null,sourceType:null,sourceId:null,scheduleType:'one_time',startsAt:'2026-10-28T01:00:00.000Z',nextDueAt:'2026-10-28T01:00:00.000Z',dueHasExplicitTime:false,intervalValue:null,intervalUnit:null,timesOfDay:[],endsAt:null,timezone:'Asia/Shanghai',note:'',leadTimeMinutes:0,repeatWhileOverdue:false,status:'scheduled',isActive:true};
   const reminder=db.createReminder(input),skipped=db.createReminder({...input,title:'Skip me'});
   await completeReminder(reminder.id,new Date('2026-10-29T02:00:00.000Z'));
   await skipReminder(skipped.id,new Date('2026-10-29T02:01:00.000Z'));
   const read=date=>withHomeReadOnlyRepository(()=>getHomeDayOverview(date,{readOnly:true}));
   const today=await read('2026-10-29');
   assert.deepEqual(today.tasks.map(t=>t.id).sort((a,b)=>a-b),[task.id,old.id]);
   assert.equal(today.completedItems.length,1,'reminder plus generated cat event deduplicate');
   assert.match(today.completedItems[0].title,/Clean litter box/);
   assert.equal(today.completedItems[0].completedAt,'2026-10-29T02:00:00.000Z');
   assert.equal((await read('2026-10-28')).tasks.length,0);
   assert.equal((await read('2026-10-27')).tasks.length,0,'completion does not pretend it happened on due day');
   assert.deepEqual((await read('2026-10-29')).completedItems,today.completedItems,'refresh preserves completion');
   assert.equal(db.listReminderOccurrences(dateRange('2026-10-29')).length,1,'skip is not a completion');
   db.updateTask(task.id,{completed:false,completedAt:null});
   assert.equal((await read('2026-10-29')).tasks.some(t=>t.id===task.id),false,'reopening removes completion fact');
  `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),VERCEL:""}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
