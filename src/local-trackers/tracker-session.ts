import {LocalTrackerStore, type LocalTrackerRecord} from "@/lib/tracker-local-store";
import {canEditTrackerRecord} from "@/lib/tracker-replica";
import {parseNewTrackerEntry} from "@/lib/validation";
import {validatedTrackerValues} from "@/lib/tracker-values";
import {asField, belongs} from "./tracker-records";
import {isPreviewAccount,type LocalAccount,type TrackerPlatform} from "./platform";
import {requestFailure} from "@/lib/request-diagnostics";

// One store per signed-in session: page and global capture share listeners and sync work.
const sessions = new WeakMap<LocalAccount, WeakMap<TrackerPlatform, LocalTrackerStore>>();
export function trackerSession(account:LocalAccount, platform:TrackerPlatform) {
  let platforms=sessions.get(account);
  if(!platforms){platforms=new WeakMap();sessions.set(account,platforms);}
  let store=platforms.get(platform);
  if(!store){store=new LocalTrackerStore(account.accountId,platform.storage(account));platforms.set(platform,store);}
  return store;
}

type SyncActivity={syncing:boolean;error:string;lastSyncedAt:string|null};
function createActivity(){
  let state:SyncActivity={syncing:false,error:"",lastSyncedAt:null};
  const listeners=new Set<()=>void>();
  return {getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    update:(patch:Partial<SyncActivity>)=>{state={...state,...patch};listeners.forEach(listener=>listener());},work:null as Promise<void>|null};
}
const activities=new WeakMap<LocalTrackerStore,ReturnType<typeof createActivity>>();
export function trackerSyncActivity(store:LocalTrackerStore){
  let activity=activities.get(store);if(!activity){activity=createActivity();activities.set(store,activity);}return activity;
}
export function synchronizeTrackerSession(account:LocalAccount,platform:TrackerPlatform):Promise<void>{
  const readOnly=platform.readOnly(account);
  if(isPreviewAccount(account)&&!readOnly)return Promise.resolve();
  const store=trackerSession(account,platform),activity=trackerSyncActivity(store);
  if(activity.work)return activity.work;
  activity.update({syncing:true,error:""});
  activity.work=(async()=>{
    try{
      if(readOnly){await platform.inspection(account);await platform.refreshReadonly(account);await store.initialize();}
      else try{await store.synchronize(platform.sync);}catch(reason){
        if(!store.getSnapshot().remoteRevision)try{await platform.refreshReadonly(account);await store.initialize();}catch{/* Failed downloads never discard local drafts. */}
        throw reason;
      }
      if(!readOnly){
        const state=store.getSnapshot();
        if(!state.readOnly&&state.records.some(row=>row.resourceType==="tracker"&&row.serverId&&row.payload.iconType==="image")){
          try{await platform.refreshReadonly(account);await store.initialize();}
          catch(reason){activity.update({error:`Tracker records synced, but icons could not be downloaded. Refresh when connected. ${requestFailure(reason,"Trackers · icon cache download").message}`});}
        }
      }
      activity.update({lastSyncedAt:new Date().toISOString()});
    }catch(reason){activity.update({error:reason instanceof Error?reason.message:String(reason)});throw reason;}
    finally{activity.work=null;activity.update({syncing:false});}
  })();
  return activity.work;
}

export async function saveLocalTrackerEntry(store:LocalTrackerStore, tracker:LocalTrackerRecord, input:unknown, editing?:LocalTrackerRecord) {
  const state=store.getSnapshot(), current=state.records.find(row=>row.id===tracker.id&&row.resourceType==="tracker");
  if(!current||!canEditTrackerRecord(current)||current.payload.archivedAt||state.outbox.some(item=>item.localId===current.id&&item.operation==="delete"))throw new Error("This Tracker is unavailable. Refresh or resolve its sync issue first.");
  const fields=state.records.filter(row=>row.resourceType==="tracker_field"&&belongs(row,current)).map(asField);
  const parsed=parseNewTrackerEntry(input,current.serverId??1);
  const payload={...parsed,trackerId:current.serverId,trackerLocalId:current.id,values:validatedTrackerValues(fields,parsed.values,Boolean(current.payload.quickCaptureEnabled),Boolean(editing))};
  if(editing?.status)await store.resolve(editing.id,"local",payload);else await store.save("tracker_entry",editing?.id,payload);
}
