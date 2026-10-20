import {emptyTrackerState,mergeTrackerResponse,validateTrackerState,type TrackerLocalState,type LocalTrackerRecord} from "./tracker-local-store.ts";
import {readonlyTrackerState,type TrackerReadonlySnapshot} from "./tracker-readonly.ts";
import type {TrackerSyncRequest,TrackerSyncResponse} from "./tracker-local-contract.ts";

export function trackerReplicaState(accountId:string,saved:TrackerLocalState|null,snapshot:TrackerReadonlySnapshot|null){
 if(saved){
  validateTrackerState(saved,accountId);if(!snapshot)return saved;
  const projection=readonlyTrackerState(snapshot,accountId),next={...saved,records:[...saved.records],readOnly:projection.readOnly};
  if(!saved.remoteRevision)for(const row of projection.records){const index=next.records.findIndex(item=>item.resourceType===row.resourceType&&item.serverId===row.serverId);if(index<0)next.records.push(row);else if(!next.records[index].version&&!saved.outbox.some(item=>item.localId===next.records[index].id))next.records[index]=row;}
  return next;
 }
 const seed=snapshot?readonlyTrackerState(snapshot,accountId):emptyTrackerState(accountId);
 // The independent replica has no committed revision yet. Never import the legacy outbox.
 return {...seed,revision:0};
}
export function canEditTrackerRecord(row:LocalTrackerRecord){return !row.status&&(!row.serverId||Boolean(row.version));}
export function requireReplicaMutations(state:TrackerLocalState|null,request:TrackerSyncRequest){
 if(request.protocolVersion!==2)throw new Error("Unsupported Tracker replica protocol");
 if(!request.mutations.length)return;
 if(!state||state.accountId!==request.accountId)throw new Error("Tracker replica account changed");
 for(const mutation of request.mutations)if(!state.outbox.some(item=>item.mutationId===mutation.mutationId&&JSON.stringify(item.wire)===JSON.stringify(mutation)))throw new Error("Only the independent frozen Tracker queue may be uploaded");
}
export function validateReplicaHandshake(accountId:string,response:TrackerSyncResponse){
 mergeTrackerResponse(emptyTrackerState(accountId),response,[]);
 return response;
}
