import {useCallback,useEffect,useState,useMemo,useSyncExternalStore} from "react";
import {TrackerDetailContent,type TrackerDetailData} from "@/app/trackers/[id]/tracker-detail-content";
import {useBusinessRequest} from "@/components/business-request-context";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {useLocale} from "@/components/locale-controller";
import {responseError} from "@/lib/response-error";
import {LocalTrackerPicture} from "./tracker-picture";
import type {Tracker} from "@/lib/types";
import {LocalRouteLink} from "./routes";
import {trackerSession,synchronizeTrackerSession} from "./tracker-session";
import {belongs} from "./tracker-records";
import type {LocalAccount,TrackerPlatform} from "./platform";

export function TrackerOnlineSettings({account,platform,trackerId,onExit}:{account:LocalAccount;platform:TrackerPlatform;trackerId:number;onExit:()=>void}){
 const request=useBusinessRequest(),{english}=useLocale();
 const store=useMemo(()=>trackerSession(account,platform),[account,platform]),state=useSyncExternalStore(store.subscribe,store.getSnapshot);
 const Picture=useCallback(({tracker,size}:{tracker:Tracker;size?:number})=><LocalTrackerPicture row={{id:String(tracker.id),serverId:tracker.id,resourceType:"tracker",payload:{...tracker}}} state={state} size={size}/>,[state]);
 const [data,setData]=useState<TrackerDetailData|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 const transport=useCallback(async(path:string,init?:RequestInit)=>{
  const write=(init?.method??"GET")!=="GET";
  if(write){
   if(!navigator.onLine)throw new Error("Connect to update Tracker settings. No operation was queued.");
   await synchronizeTrackerSession(account,platform);
   const state=trackerSession(account,platform).getSnapshot(),parent=state.records.find(row=>row.resourceType==="tracker"&&row.serverId===trackerId);
   if(!parent||parent.status||state.outbox.some(item=>{const row=state.records.find(row=>row.id===item.localId);return item.localId===parent.id||Boolean(row&&belongs(row,parent));}))throw new Error("Resolve this Tracker's pending edits before changing its settings. Local drafts are preserved.");
  }
  const response=await request(path,init);
  if(write&&response.ok){
   try{await synchronizeTrackerSession(account,platform);await platform.refreshReadonly(account);await trackerSession(account,platform).initialize();}catch{setError(english?"Saved online. The local copy still needs to refresh.":"已在线保存，本机副本仍需刷新。");}
  }
  return response;
 },[request,account,platform,trackerId,english]);
 useEffect(()=>{let alive=true;void request(`/api/trackers/${trackerId}`,{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error(await responseError(response,"Could not load Tracker settings"));const value=await response.json();if(alive){setData(value);setError("");}}).catch(reason=>{if(alive)setError(reason instanceof Error?reason.message:String(reason));});return()=>{alive=false;};},[request,trackerId,attempt]);
 return <>{error&&<ErrorNotice>{error}</ErrorNotice>}{data?<TrackerDetailContent initial={data} trackerId={trackerId} settingsOnly navigation={{push:onExit,refresh:()=>{}}} transport={transport} LinkComponent={LocalRouteLink} Picture={Picture} reconcileNotifications={false}/>:error?<button type="button" className="button secondary" onClick={()=>setAttempt(value=>value+1)}>{english?"Retry":"重试"}</button>:<PageLoading compact/>}</>;
}
