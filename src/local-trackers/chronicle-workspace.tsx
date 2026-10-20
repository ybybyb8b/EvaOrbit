import {LocalBackAction} from "./navigation-header";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {ChronicleView} from "@/app/chronicle/chronicle-view";
import {ChronicleDetailContent} from "@/app/chronicle/[id]/chronicle-detail-view";
import {ChronicleDataProvider,type ChronicleRead} from "@/components/chronicle-data-context";
import {FormPreview} from "@/components/form-preview";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readChronicleSnapshot,type ChronicleReadonlySnapshot} from "@/lib/chronicle-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalChronicleLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}
export function ChronicleWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<ChronicleReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[id,setId]=useState<number|null>(null);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.chronicleSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Chronicle; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.chronicleSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=()=>{if(alive&&navigator.onLine)void refresh();};
    window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:chronicle-refresh",active);
    return()=>{alive=false;window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:chronicle-refresh",active);};
  },[account,platform]);
  const read=useCallback<ChronicleRead>(async(path,init)=>{if(!snapshot)throw new Error("Chronicle is not downloaded");return readChronicleSnapshot(snapshot,path,init);},[snapshot]);
  function navigate(path:string){const match=/^\/chronicle(?:\/([1-9][0-9]*))?$/.exec(path);if(!match){setError("This page is not available in the offline preview");return;}setId(match[1]?Number(match[1]):null);window.scrollTo(0,0);}
  const item=snapshot?.items.find(item=>item.id===id);
  return <><LocalBackAction onBack={id!==null?()=>navigate("/chronicle"):undefined}/><div className="page local-chronicle-status"><DevelopmentDetails><p>Read-only Chronicle · {snapshot?new Date(snapshot.capturedAt).toLocaleString():"Not downloaded"}. Latest 100 entries; 8 MiB per account. Search covers downloaded entries. External Markdown images and links are unavailable in this offline preview. Drafts are temporary.</p><button className="text-button" disabled={busy} onClick={()=>window.dispatchEvent(new Event("eo:chronicle-refresh"))}>{busy?"Refreshing…":"Refresh downloaded Chronicle"}</button></DevelopmentDetails>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="纪事" englishTitle="Chronicle"/>:<div className="page"><p>Chronicle has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><ChronicleDataProvider read={read} Link={LocalChronicleLink} complete={snapshot.complete}><FormPreview>

      {id===null?<ChronicleView initial={snapshot.items}/>:item?<ChronicleDetailContent key={item.id} initial={item} onDeleted={()=>navigate("/chronicle")}/>:<div className="page"><p>This entry is not in the downloaded snapshot.</p></div>}
    </FormPreview></ChronicleDataProvider></Navigate.Provider>}
  </>;
}
