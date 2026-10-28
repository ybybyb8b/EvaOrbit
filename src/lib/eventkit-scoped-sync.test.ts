import assert from "node:assert/strict";
import test,{mock} from "node:test";
import {runEventKitSyncSingleFlight,synchronizeEventKit,synchronizeEventKitScopes,type EventKitStatus} from "./eventkit-sync.ts";

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

async function scopedFixture(run:(f:{status:EventKitStatus;kinds:string[];setFailure:(value:string)=>void})=>Promise<void>){
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,kinds:string[]=[];let failure="calendar";
 const source=(identifier:string)=>({identifier,title:identifier,sourceIdentifier:"icloud",sourceTitle:"iCloud",allowsContentModifications:true});
 const status:EventKitStatus={available:true,installationId:"test",calendarPermission:"full_access",reminderPermission:"full_access",calendars:[source("calendar")],reminderLists:[source("list")]};
 globalThis.window=Object.assign(new EventTarget(),{EvaOrbitNative:{version:1,call:async(method:string,args:Record<string,unknown>)=>{
  if(method==="eventkit.fetch"){kinds.push(String(args.kind));if(args.kind===failure)return{ok:false,error:{code:"fixture_read_failed",message:"Read failed"}};return{ok:true,result:{items:[]}};}
  throw Error("Unexpected native call "+method);
 }}}) as unknown as Window & typeof globalThis;
 globalThis.fetch=async()=>Response.json([]);
 try{await run({status,kinds,setFailure:value=>{failure=value;}});}finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
}
test("one domain read failure preserves the other's result without reporting full success",async()=>scopedFixture(async f=>{
 const result=await synchronizeEventKit(f.status,{calendar:"import",list:"import"},{},"all",true);
 assert.equal(result.scopeOutcomes?.calendar?.state,"failed");assert.equal(result.scopeOutcomes?.reminder?.state,"complete");assert.ok(f.kinds.includes("reminder"));
 f.kinds.length=0;f.setFailure("reminder");const reverse=await synchronizeEventKitScopes(f.status,{calendar:"import",list:"import"},{},true);
 assert.equal(reverse.scopeOutcomes?.calendar?.state,"complete");assert.equal(reverse.scopeOutcomes?.reminder?.state,"failed");
}));
test("Calendar permission revocation pauses only Calendar",async()=>scopedFixture(async f=>{
 const result=await synchronizeEventKitScopes({...f.status,calendarPermission:"denied"},{calendar:"import",list:"import"},{},true);
 assert.equal(result.scopeOutcomes?.calendar?.state,"paused");assert.equal(result.scopeOutcomes?.reminder?.state,"complete");assert.deepEqual(f.kinds,["reminder"]);
}));
test("a stalled Calendar read times out, Reminders continues, and its late reply cannot resume writes",async()=>scopedFixture(async f=>{
 mock.timers.enable({apis:["setTimeout"]});let release!:(value:unknown)=>void,calendarStarted=false;
 const gate=new Promise(resolve=>{release=resolve;});const bridge=window.EvaOrbitNative!,original=bridge.call;
 bridge.call=async(method,args)=>{if(method==="eventkit.fetch"&&args?.kind==="calendar"){calendarStarted=true;await gate;return{ok:true,result:{items:[]} as never};}return original(method,args);};
 try{const work=synchronizeEventKitScopes(f.status,{calendar:"import",list:"import"},{},true);for(let i=0;i<30&&!calendarStarted;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(calendarStarted,true);mock.timers.tick(30_001);const result=await work;assert.equal(result.scopeOutcomes?.calendar?.state,"failed");assert.equal(result.scopeOutcomes?.reminder?.state,"complete");release(null);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.kinds,["reminder"]);}finally{release?.(null);mock.timers.reset();bridge.call=original;}
}));

test("same domain with a changed configuration queues a fresh run instead of reusing stale results",async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),order:string[]=[];
 const result={imported:0,exported:0,merged:0,conflicts:[],skippedEvents:[],lastSync:"test"};
 const old=runEventKitSyncSingleFlight(async()=>{order.push("old");await gate;return result;},"calendar","old-config");
 const fresh=runEventKitSyncSingleFlight(async()=>{order.push("new");return result;},"calendar","new-config");
 assert.notEqual(old,fresh);assert.deepEqual(order,["old"]);release();await old;await fresh;assert.deepEqual(order,["old","new"]);
});
