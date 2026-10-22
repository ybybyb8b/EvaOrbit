import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {SyncManager} from "@/components/sync-manager";
import {syncModules,type SyncModuleId,type ModuleSyncStatus} from "@/lib/sync-modules";
import {readModuleSyncStatus} from "./sync-resources";
import {TrackerSyncSettings} from "./tracker-sync-settings";
import {trackerSession,trackerSyncActivity,synchronizeTrackerSession} from "./tracker-session";
import type {LocalAccount,TrackerPlatform} from "./platform";

export function LocalSyncManager({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
 const [statuses,setStatuses]=useState<Partial<Record<SyncModuleId,ModuleSyncStatus>>>({}),[online,setOnline]=useState(()=>navigator.onLine),[initialError,setInitialError]=useState("");
 const updatingAll=useRef(false),alive=useRef(false),running=useRef(new Set<SyncModuleId>());
 const store=useMemo(()=>trackerSession(account,platform),[account,platform]),state=useSyncExternalStore(store.subscribe,store.getSnapshot),activity=trackerSyncActivity(store),progress=useSyncExternalStore(activity.subscribe,activity.getSnapshot);
 const load=useCallback(async(id:SyncModuleId,refresh:boolean)=>{
  if(running.current.has(id))return;running.current.add(id);if(alive.current)setStatuses(current=>({...current,[id]:{...current[id],busy:true,error:undefined}}));
  try{const result=await readModuleSyncStatus(platform,account,id,refresh);if(alive.current)setStatuses(current=>({...current,[id]:result}));}
  catch(reason){if(alive.current)setStatuses(current=>({...current,[id]:{...current[id],busy:false,error:reason instanceof Error?reason.message:String(reason)}}));}
  finally{running.current.delete(id);}
 },[platform,account]);
 useEffect(()=>{alive.current=true;void store.initialize().catch(reason=>{if(alive.current)setInitialError(reason instanceof Error?reason.message:String(reason));});for(const row of syncModules)if(row.id!=="trackers")void load(row.id,false);const update=()=>setOnline(navigator.onLine);window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{alive.current=false;window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[load,store]);
 const refresh=(id:SyncModuleId)=>id==="trackers"?synchronizeTrackerSession(account,platform).catch(()=>{}):load(id,true);
 async function refreshAll(){if(updatingAll.current)return;updatingAll.current=true;try{await refresh("trackers");const modules=syncModules.filter(row=>row.id!=="trackers");for(let offset=0;offset<modules.length&&alive.current;offset+=2)await Promise.all(modules.slice(offset,offset+2).map(row=>load(row.id,true)));}finally{updatingAll.current=false;}}
 return <SyncManager local online={online} statuses={{...statuses,trackers:{busy:progress.syncing,error:progress.error||initialError,capturedAt:progress.lastSyncedAt??undefined,hasLocalData:Boolean(state.remoteRevision||state.readOnly||state.records.length),paused:platform.readOnly(account),pending:state.outbox.length,issues:state.records.filter(row=>row.status).length}}} onRefresh={id=>void refresh(id)} onRefreshAll={()=>void refreshAll()} trackerDetails={<TrackerSyncSettings account={account} platform={platform} inSheet/>}/>;
}
