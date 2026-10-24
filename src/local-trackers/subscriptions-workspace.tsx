import {registerLocalRefresh} from "./refresh";
import {useLocalInitialPath} from "./routes";
import {LocalBackAction} from "./navigation-header";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {SubscriptionsContent} from "@/app/subscriptions/subscriptions-view";
import {SubscriptionDetailView} from "@/app/subscriptions/[id]/subscription-detail-view";
import {SoftwareLibraryView} from "@/app/subscriptions/library/software-library-view";
import {SubscriptionSections} from "@/app/subscriptions/subscription-sections";
import {dateInEvaOrbit} from "@/lib/time";
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
  const [snapshot,setSnapshot]=useState<SubscriptionsReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[path,setPath]=useState(useLocalInitialPath("/subscriptions"));
  const route=new URL(path,"https://eo.local"),library=route.pathname==="/subscriptions/library";
  const id=/^\/subscriptions\/([1-9][0-9]*)$/.exec(route.pathname)?.[1];
  const initialView=route.searchParams.get("view")==="trends"?"trends":"home";
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.subscriptionsSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Subscriptions; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.subscriptionsSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const stopPullRefresh=registerLocalRefresh(refresh);
  const active=(event:Event)=>{const detail=(event as CustomEvent).detail;if(event.type===onlineBusinessChanged&&detail?.accountId!==account.accountId)return;if(event.type===onlineBusinessChanged&&detail?.snapshotUpdated&&detail?.resource==="subscriptions"){void platform.subscriptionsSnapshot(account).then(value=>{if(alive&&value){setSnapshot(value);setError("");}}).catch(()=>{});return;}if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:subscriptions-refresh",active);
    return()=>{stopPullRefresh();alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:subscriptions-refresh",active);};
  },[account,platform]);
  const read=useOnlineReader(useCallback<SubscriptionsRead>(async(path,init)=>{if(!snapshot)throw new Error("Subscriptions is not downloaded");return readSubscriptionsSnapshot(snapshot,path,init);},[snapshot]));
  function navigate(path:string){if(!/^\/subscriptions(?:\/[1-9][0-9]*|\/library|\?view=(?:overview|trends))?$/.test(path)){setError("This page is not available in Subscriptions");return;}setPath(path);window.scrollTo(0,0);}
  const item=snapshot?.items.find(item=>item.id===Number(id));
  return <><LocalBackAction onBack={id?()=>navigate("/subscriptions"):undefined}/><div className="page local-subscriptions-status"><LocalDownloadStatus module="Subscriptions" capturedAt={snapshot?.capturedAt} busy={busy} error={error}  refresh={()=>window.dispatchEvent(new Event("eo:subscriptions-refresh"))}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="订阅" englishTitle="Subscriptions"/>:<div className="page"><p>Subscriptions has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><SubscriptionsDataProvider read={read} Link={LocalSubscriptionLink} iconSources={snapshot.iconSources} libraryIconSources={snapshot.libraryIconSources}><FormPreview>

      {library?snapshot.library?<SoftwareLibraryView initial={snapshot.library}/>:<div className="page"><h1>Software library</h1><SubscriptionSections active="library"/><p>Connect and refresh Subscriptions to download your software library.</p><button className="button secondary" onClick={()=>window.dispatchEvent(new Event("eo:subscriptions-refresh"))}>Refresh</button></div>:!id?<SubscriptionsContent initialView={initialView} initial={snapshot.items} payments={snapshot.items.flatMap(item=>item.payments)} today={dateInEvaOrbit()}/>:item?<SubscriptionDetailView key={item.id} initial={item}/>:<div className="page"><p>This subscription is not in the downloaded snapshot.</p></div>}
    </FormPreview></SubscriptionsDataProvider></Navigate.Provider>}
  </>;
}
