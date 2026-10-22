import {useLocalInitialPath} from "./routes";
import {LocalBackAction} from "./navigation-header";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {CatsView} from "@/app/cats/cats-view";
import {PetDetailView} from "@/app/cats/[id]/pet-detail-view";
import {CatFoodLibraryView} from "@/app/cats/food/cat-food-library-view";
import {CatFoodDetailContent} from "@/app/cats/food/[id]/cat-food-detail-view";
import {CatsDataProvider,type CatsRead} from "@/components/cats-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readCatsSnapshot,type CatsReadonlySnapshot} from "@/lib/cats-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalCatsLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>;}

export function CatsWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<CatsReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[path,setPath]=useState(useLocalInitialPath("/cats"));
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.catsSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Cats; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.catsSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=()=>{if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);window.addEventListener("eo:cats-refresh",active);
    return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);window.removeEventListener("eo:cats-refresh",active);};
  },[account,platform]);
  const read=useOnlineReader(useCallback<CatsRead>(async(url,init)=>{if(!snapshot)throw new Error("Cats is not downloaded");return readCatsSnapshot(snapshot,url,init);},[snapshot]));
  function navigate(next:string){if(!/^\/cats(?:\/food(?:\/[1-9][0-9]*)?|\/[1-9][0-9]*)?$/.test(next)){setError("This page is not available in the offline preview");return;}setPath(next);window.scrollTo(0,0);}
  const petId=/^\/cats\/([1-9][0-9]*)$/.exec(path),foodId=/^\/cats\/food\/([1-9][0-9]*)$/.exec(path);
  const detail=snapshot?.details.find(d=>d.pet.id===Number(petId?.[1])),food=snapshot?.foods.find(d=>d.id===Number(foodId?.[1]));
  return <><LocalBackAction onBack={path!=="/cats"?()=>navigate(foodId?"/cats/food":"/cats"):undefined}/><div className="page local-cats-status"><LocalDownloadStatus module="Cats" capturedAt={snapshot?.capturedAt} busy={busy} error={error}  refresh={()=>window.dispatchEvent(new Event("eo:cats-refresh"))}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="猫咪" englishTitle="Cats"/>:<div className="page"><p>Cats has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><CatsDataProvider read={read} Link={LocalCatsLink}><FormPreview>

      {path==="/cats"?<CatsView initialDashboard={snapshot.dashboard} foodSummary={{items:snapshot.foods.length,packages:snapshot.foods.reduce((n,f)=>n+f.stockPackages,0),lowStock:snapshot.foods.filter(f=>f.stockState!=="available").length}}/>:path==="/cats/food"?<CatFoodLibraryView initialItems={snapshot.foods}/>:detail?<PetDetailView key={detail.pet.id} initial={detail}/>:food?<CatFoodDetailContent key={food.id} initialItem={food} onArchived={()=>navigate("/cats/food")}/>:<div className="page"><p>This item is not in the downloaded snapshot.</p></div>}
    </FormPreview></CatsDataProvider></Navigate.Provider>}
  </>;
}
