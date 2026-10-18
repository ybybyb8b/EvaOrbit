import assert from "node:assert/strict";
import test from "node:test";
import { fetchReadonlyTrackers, readonlyTrackerState, type TrackerReadonlySnapshot } from "./tracker-readonly.ts";
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
