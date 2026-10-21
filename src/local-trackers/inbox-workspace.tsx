import {useCallback,useEffect,useState} from "react";
import {InboxView} from "@/app/inbox/inbox-view";
import {InboxDataProvider,type InboxRead} from "@/components/inbox-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readInboxSnapshot,type InboxReadonlySnapshot} from "@/lib/inbox-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";
export function InboxWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<InboxReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.inboxSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Inbox; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.inboxSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=()=>{if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:inbox-refresh",active);
    return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:inbox-refresh",active);};
  },[account,platform]);
  const read=useOnlineReader(useCallback<InboxRead>(async(path,init)=>{if(!snapshot)throw new Error("Inbox is not downloaded");return readInboxSnapshot(snapshot,path,init);},[snapshot]));
  return <><div className="page local-inbox-status"><DevelopmentDetails><p>Downloaded Inbox · {snapshot?new Date(snapshot.capturedAt).toLocaleString():"Not downloaded"}. Up to 500 downloaded Inbox items; 8 MiB per account. Status filters cover downloaded items. Changes save online; offline writes are not queued.</p><button className="text-button" disabled={busy} onClick={()=>window.dispatchEvent(new Event("eo:inbox-refresh"))}>{busy?"Refreshing…":"Refresh downloaded Inbox"}</button></DevelopmentDetails>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="散落" englishTitle="Inbox"/>:<div className="page"><p>Inbox has not been downloaded. Connect and refresh to make it available offline.</p></div>:<InboxDataProvider read={read}><FormPreview><InboxView/></FormPreview></InboxDataProvider>}

  </>;
}
