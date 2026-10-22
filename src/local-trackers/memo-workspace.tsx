import {useLocalInitialPath} from "./routes";
import {LocalBackAction} from "./navigation-header";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {MemoView} from "@/app/memo/memo-view";
import {MemoDetailContent} from "@/app/memo/[id]/memo-detail-view";
import {MemoDataProvider,type MemoRead} from "@/components/memo-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readMemoSnapshot,type MemoReadonlySnapshot} from "@/lib/memo-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalMemoLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}
export function MemoWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<MemoReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[id,setId]=useState<number|null>(Number(useLocalInitialPath("/memo").split("/")[2])||null);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.memoSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Memo; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.memoSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=()=>{if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:memo-refresh",active);
    return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:memo-refresh",active);};
  },[account,platform]);
  const read=useOnlineReader(useCallback<MemoRead>(async(path,init)=>{if(!snapshot)throw new Error("Memo is not downloaded");return readMemoSnapshot(snapshot,path,init);},[snapshot]));
  function navigate(path:string){const match=/^\/memo(?:\/([1-9][0-9]*))?$/.exec(path);if(!match){setError("This page is not available in the offline preview");return;}setId(match[1]?Number(match[1]):null);window.scrollTo(0,0);}
  const item=snapshot?.items.find(item=>item.id===id);
  return <><LocalBackAction onBack={id!==null?()=>navigate("/memo"):undefined}/><div className="page local-memo-status"><LocalDownloadStatus module="Memo" capturedAt={snapshot?.capturedAt} busy={busy} error={error} complete={snapshot?.complete} refresh={()=>window.dispatchEvent(new Event("eo:memo-refresh"))}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="碎片" englishTitle="Memo"/>:<div className="page"><p>Memo has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><MemoDataProvider read={read} Link={LocalMemoLink} complete={snapshot.complete}><FormPreview>

      {id===null?<MemoView initial={snapshot.items}/>:item?<MemoDetailContent key={item.id} initial={item} onDeleted={()=>navigate("/memo")}/>:<div className="page"><p>This entry is not in the downloaded snapshot.</p></div>}
    </FormPreview></MemoDataProvider></Navigate.Provider>}
  </>;
}
