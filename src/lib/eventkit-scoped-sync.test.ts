import assert from "node:assert/strict";
import test from "node:test";
import {runEventKitSyncSingleFlight,synchronizeEventKit,type EventKitStatus} from "./eventkit-sync.ts";

test("separate sync reads only the selected Apple domain despite both saved configurations",async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,requests:string[]=[],kinds:unknown[]=[];
 const source=(identifier:string)=>({identifier,title:identifier,sourceIdentifier:"icloud",sourceTitle:"iCloud",allowsContentModifications:true});
 const status:EventKitStatus={available:true,installationId:"test",calendarPermission:"full_access",reminderPermission:"full_access",calendars:[source("calendar")],reminderLists:[source("list")]};
 globalThis.window={EvaOrbitNative:{version:1,call:async(method:string,args:Record<string,unknown>)=>{
  assert.equal(method,"eventkit.fetch");kinds.push(args.kind);return{ok:true,result:{items:[]}};
 }}} as unknown as Window & typeof globalThis;
 globalThis.fetch=async(url,init)=>{assert.ok(!init?.method||init.method==="GET");requests.push(String(url));return Response.json([]);};
 const modes={calendar:"import",list:"two_way"} as const,routes={tasks:"list"};
 try{
  const calendar=await synchronizeEventKit(status,modes,routes,"calendar");
  assert.deepEqual(kinds,["calendar"]);assert.ok(requests[0].endsWith("&kind=event"));
  assert.ok(requests.every(path=>!path.startsWith("/api/tasks")&&!path.startsWith("/api/reminders")));
  assert.ok(calendar.calendarDiagnostics);assert.equal(calendar.reminderDiagnostics,undefined);
  requests.length=0;kinds.length=0;
  const reminder=await synchronizeEventKit(status,modes,routes,"reminder");
  assert.deepEqual(kinds,["reminder"]);assert.ok(requests[0].endsWith("&kind=reminder"));
  assert.ok(requests.every(path=>!path.startsWith("/api/calendar-events")));
  assert.ok(reminder.reminderDiagnostics);assert.equal(reminder.calendarDiagnostics,undefined);
  assert.deepEqual(modes,{calendar:"import",list:"two_way"});assert.deepEqual(routes,{tasks:"list"});
 }finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});

test("different sync scopes wait for each other, retain their own error and never overlap",async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),order:string[]=[];
 const result={imported:0,exported:0,merged:0,conflicts:[],skippedEvents:[],lastSync:"test"};
 const calendar=runEventKitSyncSingleFlight(async()=>{order.push("calendar");await gate;throw Error("Calendar failed");},"calendar");
 const failure=assert.rejects(calendar,/Calendar failed/);
 const reminder=runEventKitSyncSingleFlight(async()=>{order.push("reminder");return result;},"reminder");
 assert.deepEqual(order,["calendar"]);release();await failure;assert.equal(await reminder,result);assert.deepEqual(order,["calendar","reminder"]);
});
