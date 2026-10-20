import {createContext,useContext,useCallback,useEffect,useMemo,useState,type ComponentProps} from "react";
import {MediaView} from "@/app/media/media-view";
import {MediaDetailContent} from "@/app/media/[id]/media-detail-content";
import {MediaDataProvider,type MediaRead} from "@/components/media-data-context";
import {FormPreview} from "@/components/form-preview";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readMediaSnapshot,mediaListItems,type MediaReadonlySnapshot} from "@/lib/media-readonly";
import {LocalBackAction} from "./navigation-header";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalMediaLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}
export function MediaWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<MediaReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[path,setPath]=useState("/media"),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.mediaSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Media; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.mediaSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=()=>{if(alive&&navigator.onLine)void refresh();};
    window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);
    return()=>{alive=false;window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);};
  },[account,platform,attempt]);
  const read=useCallback<MediaRead>(async(url,init)=>{if(!snapshot)throw new Error("Media is not downloaded");return readMediaSnapshot(snapshot,url,init);},[snapshot]);
  function navigate(next:string){if(!/^\/media(?:\/(?:series\/)?[1-9][0-9]*)?$/.test(next)){setError("This page is not available in the offline preview");return;}setPath(next);window.scrollTo(0,0);}
  const detail=snapshot?.items.find(row=>path===`/media/${row.id}`);
  const series=snapshot?.series.find(row=>path===`/media/series/${row.id}`);
  const initial=useMemo(()=>snapshot?mediaListItems(snapshot.items.filter(item=>!series||item.seriesId===series.id)).slice(0,200):[],[snapshot,series]);
  return <>
    {path!=="/media"&&<LocalBackAction onBack={()=>navigate(detail?.seriesId?`/media/series/${detail.seriesId}`:"/media")}/>}
    {!snapshot?busy?<PageLoading title="影视" englishTitle="Media"/>:<div className="page"><p>Media has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><MediaDataProvider read={read} Link={LocalMediaLink}><FormPreview>
      {path==="/media"?<MediaView initial={initial} initialSeries={snapshot.series}/>:series?<MediaView key={series.id} initial={initial} initialSeries={snapshot.series} defaultSeries={series}/>:detail?<MediaDetailContent key={detail.id} initial={detail} initialSeries={snapshot.series} navigate={navigate}/>:<div className="page"><p>This work is not in the downloaded snapshot.</p></div>}
    </FormPreview></MediaDataProvider></Navigate.Provider>}
    <div className="page local-media-status"><DevelopmentDetails><p>Read-only Media · {snapshot?new Date(snapshot.capturedAt).toLocaleString():"Not downloaded"}. Up to 1,000 works with viewing history and covers; 8 MiB per account. Incomplete downloads are refused. Drafts are temporary; business writes and uploads are disabled.</p><button className="text-button" disabled={busy} onClick={()=>setAttempt(n=>n+1)}>{busy?"Refreshing…":"Refresh downloaded Media"}</button></DevelopmentDetails>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
  </>;
}
