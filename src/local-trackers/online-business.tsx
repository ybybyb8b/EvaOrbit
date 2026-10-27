import {useContext,useLayoutEffect,useMemo,type ReactNode} from "react";
import {BusinessRequestContext} from "@/components/business-request-context";
import {FormPreviewContext} from "@/components/form-preview";
import {installBusinessRequest,type BusinessRequest} from "@/lib/business-request";
import {clearClientJsonCache} from "@/lib/client-json-cache";
import {ErrorNotice} from "@/components/error-notice";
import {useState} from "react";
import {dateInEvaOrbit} from "@/lib/time";
import {isPreviewAccount,type LocalAccount,type TrackerPlatform} from "./platform";

export const onlineBusinessChanged = "eo:online-business-changed";
const Context=BusinessRequestContext;
export function OnlineBusinessProvider({account,platform,children}:{account:LocalAccount|null;platform:TrackerPlatform;children:ReactNode}){
  const [warning,setWarning]=useState<{accountId:string;text:string}|null>(null);
  const session=useMemo(()=>{
    if(!account||isPreviewAccount(account))return null;
    let alive=true;
    const request:BusinessRequest=async(path,init)=>{
      if(!alive)throw new Error("Account changed. Reopen the form.");
      const response=await platform.businessRequest(account,path,init);
      if(!alive)throw new Error("Account changed. Check the cloud before submitting again.");
      if(response.ok&&(init?.method??"GET").toUpperCase()!=="GET"){
        clearClientJsonCache();
        const domain=path.split("/")[2];
        const resource=domain==="food"||domain==="drinks"?"food":domain==="project-items"?"projects":domain==="nutrition"||domain==="preferences"?"health":domain;
        let snapshotUpdated=false;
        const refresh=domain==="trackers"||domain==="insights"?async()=>{}:domain==="food"||domain==="drinks"?()=>platform.foodSnapshot(account,true):domain==="tasks"||domain==="projects"||domain==="project-items"||domain==="lucius"?()=>platform.workspaceSnapshot(account,domain==="project-items"?"projects":domain,true):domain==="health"||domain==="nutrition"||domain==="preferences"?()=>platform.healthSnapshot(account,true):domain==="cats"?()=>platform.catsSnapshot(account,true):domain==="relations"?()=>platform.relationsSnapshot(account,true):domain==="media"?()=>platform.mediaSnapshot(account,true):domain==="subscriptions"?()=>platform.subscriptionsSnapshot(account,true):domain==="chronicle"?()=>platform.chronicleSnapshot(account,true):domain==="memos"?()=>platform.memoSnapshot(account,true):domain==="inbox"?()=>platform.inboxSnapshot(account,true):()=>platform.homeResource(account,"day",dateInEvaOrbit(),true);
        // Acknowledged writes are final. Cache work must not keep the form submitting
        // or turn an acknowledged save into an apparent failure/retry.
        void refresh().then(()=>{snapshotUpdated=true;if(alive)setWarning(null);},()=>{if(alive)setWarning({accountId:account.accountId,text:"Saved online. The offline copy could not be refreshed; connect again before relying on it."});}).finally(()=>{if(alive)window.dispatchEvent(new CustomEvent(onlineBusinessChanged,{detail:{accountId:account.accountId,path,resource,snapshotUpdated}}));});

      }
      return response;
    };
    return {request,activate:()=>{alive=true;},dispose:()=>{alive=false;}};
  },[account,platform]);
  useLayoutEffect(()=>{
    clearClientJsonCache();
    if(!session)return;
    session.activate();
    const uninstall=installBusinessRequest(session.request);
    return()=>{session.dispose();uninstall();clearClientJsonCache();};
  },[session]);
  return <Context.Provider value={session?.request??null}>{children}{warning&&warning.accountId===account?.accountId&&<ErrorNotice>{warning.text}</ErrorNotice>}</Context.Provider>;
}
export function useOnlineBusiness(){return Boolean(useContext(Context));}
export function OnlineForms({children}:{children:ReactNode}){
  const request=useContext(Context);
  return <FormPreviewContext.Provider value={!request}>{children}</FormPreviewContext.Provider>;
}
// Existing snapshots remain the offline fallback, not a queue of writes.
export function useOnlineReader(fallback:BusinessRequest):BusinessRequest{
  const request=useContext(Context);
  return useMemo(()=>!request?fallback:async(path,init)=>{
    if((init?.method??"GET").toUpperCase()!=="GET")return request(path,init);
    // A freshly downloaded snapshot must win over an older cached API list,
    // especially after a remote deletion. Use visited-response cache only when
    // the snapshot cannot answer the request.
    if(!navigator.onLine){try{return await fallback(path,init);}catch{return request(path,init);}}
    try{const response=await request(path,init);if(response.status>=500||response.status===408||response.status===429){try{return await fallback(path,init);}catch{/* Preserve the actual server error when no snapshot can answer. */}}return response;}catch(error){
      if(init?.signal?.aborted)throw error;
      return fallback(path,init);
    }
  },[request,fallback]);
}
