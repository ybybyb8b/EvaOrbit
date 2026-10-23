import {registerLocalRefresh} from "./refresh";
import {useLocalInitialPath} from "./routes";
import {LocalBackAction} from "./navigation-header";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {ChronicleView} from "@/app/chronicle/chronicle-view";
import {ChronicleDetailContent} from "@/app/chronicle/[id]/chronicle-detail-view";
import {ChronicleDataProvider,type ChronicleRead} from "@/components/chronicle-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readChronicleSnapshot,type ChronicleReadonlySnapshot} from "@/lib/chronicle-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalChronicleLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}
export function ChronicleWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<ChronicleReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[id,setId]=useState<number|null>(Number(useLocalInitialPath("/chronicle").split("/")[2])||null);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.chronicleSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Chronicle; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.chronicleSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const stopPullRefresh=registerLocalRefresh(refresh);
  const active=(event:Event)=>{const detail=(event as CustomEvent).detail;if(event.type===onlineBusinessChanged&&detail?.accountId!==account.accountId)return;if(event.type===onlineBusinessChanged&&detail?.snapshotUpdated&&detail?.resource==="chronicle"){void platform.chronicleSnapshot(account).then(value=>{if(alive&&value){setSnapshot(value);setError("");}}).catch(()=>{});return;}if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:chronicle-refresh",active);
    return()=>{stopPullRefresh();alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:chronicle-refresh",active);};
  },[account,platform]);
  const read=useOnlineReader(useCallback<ChronicleRead>(async(path,init)=>{if(!snapshot)throw new Error("Chronicle is not downloaded");return readChronicleSnapshot(snapshot,path,init);},[snapshot]));
  function navigate(path:string){const match=/^\/chronicle(?:\/([1-9][0-9]*))?$/.exec(path);if(!match){setError("This page is not available in the offline preview");return;}setId(match[1]?Number(match[1]):null);window.scrollTo(0,0);}
  const item=snapshot?.items.find(item=>item.id===id);
  return <><LocalBackAction onBack={id!==null?()=>navigate("/chronicle"):undefined}/><div className="page local-chronicle-status"><LocalDownloadStatus module="Chronicle" capturedAt={snapshot?.capturedAt} busy={busy} error={error} complete={snapshot?.complete} refresh={()=>window.dispatchEvent(new Event("eo:chronicle-refresh"))}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="纪事" englishTitle="Chronicle"/>:<div className="page"><p>Chronicle has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><ChronicleDataProvider read={read} Link={LocalChronicleLink} complete={snapshot.complete}><FormPreview>

      {id===null?<ChronicleView initial={snapshot.items}/>:item?<ChronicleDetailContent key={item.id} initial={item} onDeleted={()=>navigate("/chronicle")}/>:<div className="page"><p>This entry is not in the downloaded snapshot.</p></div>}
    </FormPreview></ChronicleDataProvider></Navigate.Provider>}
  </>;
}
