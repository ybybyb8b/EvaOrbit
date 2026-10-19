import assert from "node:assert/strict";
import test from "node:test";
import { fetchReadonlyTrackers, readonlyTrackerState, validTrackerImage, type TrackerReadonlySnapshot } from "./tracker-readonly.ts";
import type { Tracker, TrackerEntry } from "./types.ts";

const account = "10000000-0000-4000-8000-000000000001";
const snapshot = (): TrackerReadonlySnapshot => ({format:"eo-trackers-readonly-v1",accountId:account,capturedAt:"2026-10-19T00:00:00Z",details:[{tracker:{id:1,name:"History"} as Tracker,fields:[],entries:[{id:2,trackerId:1,occurredAt:"2026-10-01T00:00:00Z",note:"Keep",values:{legacy:0}} as unknown as TrackerEntry],stats:{total:1}}]});

test("read-only projection preserves historical values and cannot seed a mutation queue",()=>{
 const source=snapshot(),original=structuredClone(source),state=readonlyTrackerState(source,account);
 assert.equal(state.outbox.length,0);assert.equal(state.records.length,2);
 assert.equal(state.records[1].payload.values&& (state.records[1].payload.values as Record<string,unknown>).legacy,0);
 assert(state.records.every(row=>row.version===undefined));assert.deepEqual(source,original);
 assert.throws(()=>readonlyTrackerState(source,"other"));
 source.details[0].stats.total=2;assert.throws(()=>readonlyTrackerState(source,account),/不完整/);
});

test("readonly collection checks account before/after and rejects missing, mismatched or truncated details",async()=>{
 const source=snapshot(),calls:string[]=[];
 const get=async(path:string)=>{calls.push(path);return path==="session"?{authenticated:true,accountId:account}:path==="trackers"?[source.details[0].tracker]:source.details[0];};
 const collected=await fetchReadonlyTrackers(account,get);
 assert.equal(collected.details.length,1);assert.deepEqual(calls,["session","trackers","trackers/1","session"]);
 let identities=0;await assert.rejects(fetchReadonlyTrackers(account,async path=>path==="session"?{authenticated:true,accountId:++identities===1?account:"other"}:get(path)),/账户已变化/);
 await assert.rejects(fetchReadonlyTrackers(account,async path=>path==="trackers/1"?{...source.details[0],stats:{total:2}}:get(path)),/不完整/);
 await assert.rejects(fetchReadonlyTrackers(account,async path=>path==="trackers/1"?{...source.details[0],tracker:{id:9}}:get(path)),/不匹配/);
});

test("uploaded icons survive offline projection, refresh failures and account isolation without mutations",async()=>{
 const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhAAAAABJRU5ErkJggg==";
 assert(validTrackerImage(png));assert(!validTrackerImage(png.replace("image/png","image/jpeg")));assert(!validTrackerImage("data:image/svg+xml;base64,PHN2Zz4="));
 const source=snapshot(),tracker=source.details[0].tracker;
 Object.assign(tracker,{iconType:"image",iconValue:"private/icon.png",updatedAt:"2026-10-19T00:00:00Z"});
 const get=async(path:string)=>path==="session"?{authenticated:true,accountId:account}:path==="trackers"?[tracker]:source.details[0];
 let loads=0;
 const first=await fetchReadonlyTrackers(account,get,{load:async()=>{loads++;return png;}});
 const persisted=JSON.parse(JSON.stringify(first));
 const cached=await fetchReadonlyTrackers(account,get,{previous:persisted,load:async()=>{throw Error("must reuse");}});
 assert.equal(loads,1);assert.equal(cached.images?.["1"].dataUrl,png);
 tracker.updatedAt="2026-10-20T00:00:00Z";
 const failed=await fetchReadonlyTrackers(account,get,{previous:cached,load:async()=>{throw Error("offline");}});
 assert.equal(failed.images?.["1"].version,"2026-10-19T00:00:00Z");
 assert.equal(readonlyTrackerState(failed,account).outbox.length,0);
 const missing=await fetchReadonlyTrackers(account,get,{previous:failed,load:async()=>null});
 assert.deepEqual(missing.images,{});
 const other=await fetchReadonlyTrackers(account,get,{previous:{...cached,accountId:"other"},load:async()=>{throw Error("offline");}});
 assert.deepEqual(other.images,{});
 tracker.iconType="default";
 const reset=await fetchReadonlyTrackers(account,get,{previous:cached,load:async()=>{throw Error("must not load");}});
 assert.deepEqual(reset.images,{});
});
