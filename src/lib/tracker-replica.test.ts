import assert from "node:assert/strict";
import test from "node:test";
import {trackerReplicaState,requireReplicaMutations,validateReplicaHandshake,canEditTrackerRecord} from "./tracker-replica.ts";
import {LocalTrackerStore,emptyTrackerState,prepareTrackerBatch,type TrackerLocalState} from "./tracker-local-store.ts";
import type {TrackerReadonlySnapshot} from "./tracker-readonly.ts";
const account="10000000-0000-4000-8000-000000000001";
const snapshot={format:"eo-trackers-readonly-v1",accountId:account,capturedAt:"2026-10-20T00:00:00Z",details:[{tracker:{id:1,name:"Existing"},fields:[],entries:[],stats:{total:0}}]} as unknown as TrackerReadonlySnapshot;

test("editable Tracker replica does not import legacy mutations or invent cloud versions",async()=>{
 let saved:TrackerLocalState|null=null;
 const store=new LocalTrackerStore(account,{read:async()=>trackerReplicaState(account,saved,snapshot),commit:async(revision,next)=>{if((saved?.revision??0)!==revision)return false;saved=structuredClone(next);return true;}});
 await store.initialize();const existing=store.getSnapshot().records[0];
 assert.equal(store.getSnapshot().revision,0);assert.equal(canEditTrackerRecord(existing),false);
 await assert.rejects(store.save("tracker",existing.id,{name:"Forbidden"}),/同步版本/);
 await assert.rejects(store.save("tracker_entry",undefined,{trackerId:1}),/同步版本/);
 const id=await store.createTracker({name:"Local test"});await store.save("tracker_entry",undefined,{trackerLocalId:id,note:"Offline"});
 assert.equal(store.getSnapshot().outbox.length,2);assert.equal(canEditTrackerRecord(store.getSnapshot().records.find(r=>r.id===id)!),true);
 await store.initialize();assert.equal(store.getSnapshot().outbox.length,2);
 const batch=prepareTrackerBatch(store.getSnapshot());
 requireReplicaMutations(store.getSnapshot(),{protocolVersion:2,accountId:account,mutations:batch});
 assert.throws(()=>requireReplicaMutations(null,{protocolVersion:2,accountId:account,mutations:batch}),/account/);
 assert.throws(()=>requireReplicaMutations(store.getSnapshot(),{protocolVersion:2,accountId:account,mutations:[{...batch[0],mutationId:"old-frozen"}]}),/independent frozen/);
 assert.throws(()=>requireReplicaMutations(store.getSnapshot(),{protocolVersion:2,accountId:account,mutations:[{...batch[0],payload:{name:"tampered"}}]}),/independent frozen/);
});

test("empty handshake is validated before uploading and never accepts an unsafe response",()=>{
 const response={protocolVersion:2 as const,accountId:account,results:[],snapshot:{complete:true as const,revision:1,records:[]}};
 assert.equal(validateReplicaHandshake(account,response),response);
 for(const bad of [{...response,protocolVersion:1},{...response,accountId:"other"},{...response,snapshot:{...response.snapshot,complete:false}},{...response,results:[{mutationId:"legacy",status:"applied"}]}])assert.throws(()=>validateReplicaHandshake(account,bad as typeof response));
 const state=emptyTrackerState(account);state.revision=4;state.remoteRevision=5;state.records=[{id:"remote:tracker:1",serverId:1,version:8,resourceType:"tracker",payload:{name:"Versioned"}}];
 assert.equal(trackerReplicaState(account,state,snapshot).records[0].payload.name,"Versioned");
 assert.equal(canEditTrackerRecord(state.records[0]),true);
});

test("a cache refresh waits for an in-flight local commit and cannot roll back its draft",async()=>{
 let saved=emptyTrackerState(account),reads=0,release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const store=new LocalTrackerStore(account,{read:async()=>{reads++;return structuredClone(saved);},commit:async(_revision,next)=>{await gate;saved=structuredClone(next);return true;}});
 await store.initialize();const write=store.createTracker({name:"Keep draft"});
 await Promise.resolve();const refresh=store.initialize();await Promise.resolve();assert.equal(reads,1);
 release();await Promise.all([write,refresh]);assert.equal(reads,2);assert.equal(store.getSnapshot().records[0].payload.name,"Keep draft");assert.equal(store.getSnapshot().outbox.length,1);
});
