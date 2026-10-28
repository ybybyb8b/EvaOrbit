import assert from "node:assert/strict";
import test from "node:test";
import {eventKitRead, EventKitReadTimeout} from "./eventkit-read.ts";
import {synchronizeEventKit, type EventKitStatus} from "./eventkit-sync.ts";
import {loadEventKitAccountPreferences} from "./eventkit-auto-sync.ts";

test("EventKit reads preserve results/errors and ignore a late reply after timeout", async t => {
  assert.equal(await eventKitRead(Promise.resolve(7), "read"), 7);
  const failure = new Error("Denied");
  await assert.rejects(eventKitRead(Promise.reject(failure), "read"), error => error === failure);
  t.mock.timers.enable({apis:["setTimeout"]});
  let release!: (value: number) => void, continued = false;
  const read = eventKitRead(new Promise<number>(resolve => { release = resolve; }), "Apple Reminders").then(() => { continued = true; });
  const rejected = assert.rejects(read, error => error instanceof EventKitReadTimeout && /Apple Reminders/.test(error.message));
  t.mock.timers.tick(30_000); await rejected;
  release(1); await Promise.resolve(); assert.equal(continued, false);
});

for (const stalled of ["calendar", "reminder", "eo"]) test(`a stalled ${stalled} read stops the sync without treating it as empty or continuing on a late reply`, async t => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  const writes: string[] = [];
  let release!: (value: unknown) => void, hang = true;
  const source = {identifier:"source",title:"Synthetic",sourceIdentifier:"test",sourceTitle:"Test",allowsContentModifications:true};
  const status: EventKitStatus = {available:true,installationId:"test",calendarPermission:"full_access",reminderPermission:"full_access",calendars:[source],reminderLists:[source]};
  globalThis.window = {EvaOrbitNative:{version:1,call:async(method:string,params:Record<string,unknown>={})=>{
    if(method!=="eventkit.fetch")writes.push(method);
    const result = hang && method==="eventkit.fetch" && params.kind===stalled ? await new Promise(resolve=>{release=resolve;}) : {items:[]};
    return {ok:true,result};
  }}} as unknown as Window & typeof globalThis;
  globalThis.fetch = async (url, init) => {
    if(init?.method && init.method!=="GET")writes.push(String(url));
    if(hang && stalled==="eo" && String(url).startsWith("/api/eventkit/links"))return await new Promise<Response>(resolve=>{release=value=>resolve(value as Response);});
    return Response.json([]);
  };
  t.mock.timers.enable({apis:["setTimeout"]});
  try {
    const run=()=>synchronizeEventKit(status,{source:"import"},{},stalled==="reminder"?"reminder":"calendar");
    const first=run(),overlapping=run();assert.equal(first,overlapping);
    const rejected=assert.rejects(first,EventKitReadTimeout);
    await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(30_000);await rejected;
    assert.deepEqual(writes,[]);
    release(stalled==="eo"?Response.json([]):{items:[{title:"Late object must never import",calendarItemIdentifier:"late",calendarIdentifier:"source"}]});
    await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(writes,[]);
    hang=false;const result=await run();assert.equal(result.imported,0);assert.deepEqual(writes,[]);
  } finally {globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});

test("stalled preference reads release their single-flight and preserve saved source choices", async t => {
  const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;
  const saved=JSON.stringify({calendar:"off"}),values=new Map([["evaorbit.eventkit.sources.v1",saved]]);
  globalThis.localStorage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}} as Storage;
  let release!:(value:Response)=>void;
  globalThis.fetch=async()=>new Promise<Response>(resolve=>{release=resolve;});
  const status:EventKitStatus={available:true,installationId:"test",calendarPermission:"full_access",reminderPermission:"full_access",calendars:[],reminderLists:[]};
  t.mock.timers.enable({apis:["setTimeout"]});
  try{
    const read=loadEventKitAccountPreferences(status),rejected=assert.rejects(read,/EO sync preferences/);
    await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(30_000);await rejected;
    release(Response.json({available:false}));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(values.get("evaorbit.eventkit.sources.v1"),saved);
    globalThis.fetch=async()=>Response.json({available:false});
    assert.deepEqual((await loadEventKitAccountPreferences(status)).modes,{calendar:"off"});
  }finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage;}
});
