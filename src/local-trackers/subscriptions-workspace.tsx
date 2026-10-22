import {useLocalInitialPath} from "./routes";
import {LocalBackAction} from "./navigation-header";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {SubscriptionsContent} from "@/app/subscriptions/subscriptions-view";
import {SubscriptionDetailView} from "@/app/subscriptions/[id]/subscription-detail-view";
import {SubscriptionsDataProvider,type SubscriptionsRead} from "@/components/subscriptions-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readSubscriptionsSnapshot,type SubscriptionsReadonlySnapshot} from "@/lib/subscriptions-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalSubscriptionLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}
export function SubscriptionsWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<SubscriptionsReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[id,setId]=useState<number|null>(Number(useLocalInitialPath("/subscriptions").split("/")[2])||null);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.subscriptionsSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Subscriptions; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.subscriptionsSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=()=>{if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:subscriptions-refresh",active);
    return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:subscriptions-refresh",active);};
  },[account,platform]);
  const read=useOnlineReader(useCallback<SubscriptionsRead>(async(path,init)=>{if(!snapshot)throw new Error("Subscriptions is not downloaded");return readSubscriptionsSnapshot(snapshot,path,init);},[snapshot]));
  function navigate(path:string){const match=/^\/subscriptions(?:\/([1-9][0-9]*))?$/.exec(path);if(!match){setError("This page is not available in the offline preview");return;}setId(match[1]?Number(match[1]):null);window.scrollTo(0,0);}
  const item=snapshot?.items.find(item=>item.id===id);
  return <><LocalBackAction onBack={id!==null?()=>navigate("/subscriptions"):undefined}/><div className="page local-subscriptions-status"><LocalDownloadStatus module="Subscriptions" capturedAt={snapshot?.capturedAt} busy={busy} error={error}  refresh={()=>window.dispatchEvent(new Event("eo:subscriptions-refresh"))}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="订阅" englishTitle="Subscriptions"/>:<div className="page"><p>Subscriptions has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><SubscriptionsDataProvider read={read} Link={LocalSubscriptionLink} iconSources={snapshot.iconSources}><FormPreview>

      {id===null?<SubscriptionsContent initial={snapshot.items} payments={snapshot.items.flatMap(item=>item.payments)} today={snapshot.today}/>:item?<SubscriptionDetailView key={item.id} initial={item}/>:<div className="page"><p>This subscription is not in the downloaded snapshot.</p></div>}
    </FormPreview></SubscriptionsDataProvider></Navigate.Provider>}
  </>;
}
