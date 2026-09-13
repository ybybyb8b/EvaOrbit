import type { MenstrualFlowRecord } from "./types";
import { getNativeHostInfo, hostSupports, nativeCall } from "./native-bridge";

const saveMethod="healthkit.saveMenstrualFlow",deleteMethod="healthkit.deleteMenstrualFlow";

export async function syncMenstrualFlowToHealthKit(record:MenstrualFlowRecord){
  const info=await getNativeHostInfo();
  if(record.source!=="manual"||!hostSupports(info,saveMethod)||!record.healthKitSyncIdentifier||record.deletedAt)return false;
  await nativeCall(saveMethod,{startAt:record.occurredAt,endAt:record.endedAt,flow:record.flow,cycleStart:record.isCycleStart,syncIdentifier:record.healthKitSyncIdentifier,syncVersion:record.healthKitSyncVersion});
  return true;
}

export async function flushPendingMenstrualFlowToHealthKit(){
  const info=await getNativeHostInfo();
  if(!hostSupports(info,saveMethod)||!hostSupports(info,deleteMethod))return{supported:false,synced:0,failed:0};
  const response=await fetch("/api/health/menstrual-flow?healthKitPending=true",{cache:"no-store"});
  if(!response.ok)throw new Error("Could not load pending menstrual flow sync");
  const records=await response.json() as MenstrualFlowRecord[];
  let synced=0,failed=0;
  for(const record of records){
    try{
      if(record.deletedAt){
        if(record.source==="manual")await nativeCall(deleteMethod,{sampleId:record.healthKitSampleId,syncIdentifier:record.healthKitSyncIdentifier});
        const finalized=await fetch(`/api/health/menstrual-flow/${record.id}?finalize=true`,{method:"DELETE"});
        if(!finalized.ok&&finalized.status!==404)throw new Error("Could not finalize menstrual flow deletion");
      }else await syncMenstrualFlowToHealthKit(record);
      synced+=1;
    }catch{failed+=1;}
  }
  return{supported:true,synced,failed};
}
