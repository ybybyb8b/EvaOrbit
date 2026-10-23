import {registerLocalRefresh} from "./refresh";
import {useLocalInitialPath} from "./routes";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {RelationsView} from "@/app/relations/relations-view";
import {RelationPersonContent} from "@/app/relations/[id]/person-content";
import {RelationsDataProvider,type RelationsRead} from "@/components/relations-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readRelationsSnapshot,type RelationsReadonlySnapshot} from "@/lib/relations-readonly";
import {LocalBackAction} from "./navigation-header";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalRelationsLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}
export function RelationsWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<RelationsReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[path,setPath]=useState(useLocalInitialPath("/relations")),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.relationsSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Relations; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.relationsSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const stopPullRefresh=registerLocalRefresh(refresh);
  const active=(event:Event)=>{const detail=(event as CustomEvent).detail;if(event.type===onlineBusinessChanged&&detail?.accountId!==account.accountId)return;if(event.type===onlineBusinessChanged&&detail?.snapshotUpdated&&detail?.resource==="relations"){void platform.relationsSnapshot(account).then(value=>{if(alive&&value){setSnapshot(value);setError("");}}).catch(()=>{});return;}if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);
    return()=>{stopPullRefresh();alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);};
  },[account,platform,attempt]);
  const read=useOnlineReader(useCallback<RelationsRead>(async(url,init)=>{if(!snapshot)throw new Error("Relations is not downloaded");return readRelationsSnapshot(snapshot,url,init);},[snapshot]));
  function navigate(next:string){if(!/^\/relations(?:\/[1-9][0-9]*)?$/.test(next)){setError("This page is not available in the offline preview");return;}setPath(next);window.scrollTo(0,0);}
  const detail=snapshot?.details.find(row=>path===`/relations/${row.person.id}`);
  return <>
    {path!=="/relations"&&<LocalBackAction onBack={()=>navigate("/relations")}/>}
    <div className="page local-relations-status"><LocalDownloadStatus module="Relations" capturedAt={snapshot?.capturedAt} busy={busy} error={error}  refresh={()=>setAttempt(n=>n+1)}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="关系" englishTitle="Relations"/>:<div className="page"><p>Relations has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><RelationsDataProvider read={read} Link={LocalRelationsLink}><FormPreview>
      {path==="/relations"?<RelationsView initialPeople={snapshot.people.filter(person=>!person.archivedAt)}/>:detail?<RelationPersonContent key={detail.person.id} initial={detail} people={snapshot.people} navigate={navigate}/>:<div className="page"><p>This person is not in the downloaded snapshot.</p></div>}
    </FormPreview></RelationsDataProvider></Navigate.Provider>}
  </>;
}
