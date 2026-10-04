import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("SQLite preserves Calendar all-day semantics and Task EventKit ownership",()=>{const directory=mkdtempSync(path.join(os.tmpdir(),"evaorbit-eventkit-")),databasePath=path.join(directory,"test.db"),program=`
  const db=await import("./src/lib/db.ts");const task=await import("./src/lib/services/task.ts");
  const allDay=db.createCalendarEvent({title:"Trip",notes:"原样",startAt:"2026-11-01",endAt:"2026-11-03",isAllDay:true,timezone:"America/New_York",location:"NYC",status:"confirmed"});
  const timed=db.createCalendarEvent({title:"Call",notes:"",startAt:"2026-11-01T05:30:00.000Z",endAt:"2026-11-01T06:00:00.000Z",isAllDay:false,timezone:"America/New_York",location:"",status:"tentative"});
  db.updateCalendarEvent(timed.id,{location:"Home"});
  const created=await task.createTask({title:"Pay",notes:"",dueDate:"2026-11-01",dueTime:"09:00",priority:"high",tags:[],reminderMode:"none",reminderDate:null,reminderTime:null,repeatWhileOverdue:false,timezone:"America/New_York"});
  const synced=await task.replaceTaskRemindersFromEventKit(created.id,[{absoluteDate:null,absoluteTime:null,offsetMinutes:-30,timezone:"America/New_York"},{absoluteDate:"2026-11-01",absoluteTime:"08:15",offsetMinutes:null,timezone:"America/New_York"}]);
  const completed=await task.updateTask(created.id,{completed:true,completedAt:"2026-11-01T14:02:03.000Z"});
  const events=db.listCalendarEvents({from:"2026-10-31",to:"2026-11-04"});
  for(let index=0;index<510;index++)db.createCalendarEvent({...timed,title:'Page '+index,startAt:index%2?'2026-10-10T01:00:00Z':'2026-10-09T01:00:00Z',endAt:'2026-10-10T02:00:00Z'});
  const paged=[];let afterId=0;for(;;){const page=db.listCalendarEvents({afterId,limit:100});if(!page.length)break;paged.push(...page);afterId=page.at(-1).id;}
  console.log(JSON.stringify({allDay,events,timed:db.getCalendarEvent(timed.id),channels:synced.reminders.map(r=>r.deliveryChannel),completedAt:completed.completedAt,pagedCount:paged.length,uniqueIDs:new Set(paged.map(e=>e.id)).size,ascendingIDs:paged.every((e,index)=>!index||e.id>paged[index-1].id)}));
`;try{const loader=pathToFileURL(path.join(process.cwd(),"scripts","typescript-test-loader.mjs")).href,result=spawnSync(process.execPath,["--conditions=react-server","--experimental-loader",loader,"--input-type=module","--eval",program],{cwd:process.cwd(),encoding:"utf8",env:{...process.env,NODE_ENV:"development",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath,VERCEL:""}});assert.equal(result.status,0,result.stderr||result.stdout);const value=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));assert.equal(value.allDay.startAt,"2026-11-01");assert.equal(value.events.length,2);assert.equal(value.timed.location,"Home");assert.deepEqual(value.channels,["apple_reminders","apple_reminders"]);assert.equal(value.completedAt,"2026-11-01T14:02:03.000Z");assert.equal(value.pagedCount,512);assert.equal(value.uniqueIDs,512);assert.equal(value.ascendingIDs,true);}finally{rmSync(directory,{recursive:true,force:true});}});
