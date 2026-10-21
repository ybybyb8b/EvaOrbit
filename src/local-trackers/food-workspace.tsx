import {LimitEditor} from "@/app/food-drink/limit-editor";
import type {DrinkLimit,FoodLog,DrinkLog} from "@/lib/types";
import {useBusinessRequest} from "@/components/business-request-context";
import {useCallback,useEffect,useState} from "react";
import {FoodDrinkHomeView,type FoodDrinkRecord} from "@/components/food-drink-home-view";
import {FoodRecordsView} from "@/components/food-records-view";
import {FoodSourceLinks} from "@/app/food/food-source-links";
import {DrinkRecordsView} from "@/components/drink-records-view";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {FoodLocalData} from "./food-local-data";
import {FoodPlacesView} from "@/app/food/places/places-view";
import {FoodLibraryView} from "@/app/food/library/food-library-view";
import {FoodPlaceDetailContent} from "@/app/food/places/[id]/food-place-detail-view";
import type {FoodLinkProps} from "@/components/food-data-context";
import {FoodRecordEditor} from "@/app/food/food-record-editor";
import {DrinkRecordEditor} from "@/app/drinks/drink-ui";
import {PageLogAction} from "@/components/bottom-log-core";
import {OnlineForms as FormPreview,useOnlineBusiness,onlineBusinessChanged} from "./online-business";
import {dateInEvaOrbit} from "@/lib/time";
import {foodRecordDisplay} from "@/lib/food-record-display";
import {drinkRecordName} from "@/lib/drink-display";
import type {DrinkType} from "@/lib/types";
import type {FoodReadonlySnapshot} from "@/lib/food-readonly";
import type {LocalAccount,TrackerPlatform} from "./platform";

export function FoodPreviewEditor({editor,onClose,onSaved=onClose,date=dateInEvaOrbit()}:{editor:FoodDrinkRecord;onClose:()=>void;onSaved?:()=>void|Promise<void>;date?:string}){
  return <FormPreview>{editor.kind==="food"?<FoodRecordEditor date={date} record={editor.record} onClose={onClose} onSaved={onSaved} onDeleted={onSaved}/>:<DrinkRecordEditor initialDate={date} record={editor.record} onClose={onClose} onSaved={onSaved} onDeleted={onSaved}/>}</FormPreview>;
}

export function FoodWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const onlineBusiness=useOnlineBusiness();
  const request=useBusinessRequest();
  const [history,setHistory]=useState<{key:string;foods?:FoodLog[];drinks?:DrinkLog[]}|null>(null);
  const [limitEditor,setLimitEditor]=useState<DrinkLimit|"new"|null>(null);
  const [resourceError,setResourceError]=useState("");
  const [snapshot,setSnapshot]=useState<FoodReadonlySnapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [section,setSection]=useState<"home"|"food"|"drink"|"places"|"library"|"place">("home"),[editor,setEditor]=useState<FoodDrinkRecord|null>(null);
  const [placeId,setPlaceId]=useState(0);
  const [date,setDate]=useState(dateInEvaOrbit),[query,setQuery]=useState(""),[meal,setMeal]=useState(""),[drinkType,setDrinkType]=useState<DrinkType|"">("");
  const load=useCallback(async(signal:AbortSignal)=>{
    setLoading(true);
    try{
      const cached=await platform.foodSnapshot(account);
      if(signal.aborted)return;
      if(cached){setSnapshot(cached);setDate(current=>current>cached.window.to?cached.window.to:current);}
      const fresh=await platform.foodSnapshot(account,true);
      if(signal.aborted)return;
      if(fresh){setSnapshot(fresh);setDate(current=>current>fresh.window.to?fresh.window.to:current);setError("");}
      else if(!cached)setError("Food & Drink has not been downloaded. Connect after the read-only API is available.");
    }catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:"Could not refresh Food & Drink. Cached data is preserved.");}
    finally{if(!signal.aborted)setLoading(false);}
  },[account,platform]);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    const refresh=()=>{if(!running){running=true;void load(controller.signal).finally(()=>{running=false;});}};
    refresh();window.addEventListener(onlineBusinessChanged,refresh);window.addEventListener("online",refresh);window.addEventListener("evaorbit:native-active",refresh);
    return()=>{controller.abort();window.removeEventListener(onlineBusinessChanged,refresh);window.removeEventListener("online",refresh);window.removeEventListener("evaorbit:native-active",refresh);};
  },[load]);
  const q=query.trim().toLocaleLowerCase();
  const historyKey=JSON.stringify([section,date,meal,drinkType,query,navigator.onLine,snapshot?.capturedAt]);
  useEffect(()=>{
    if(!onlineBusiness||!["food","drink"].includes(section))return;
    if(!navigator.onLine&&(section==="drink"||snapshot&&date>=snapshot.window.from&&date<=snapshot.window.to))return;
    const controller=new AbortController(),params=new URLSearchParams();
    if(section==="food"){params.set("date",date);if(meal)params.set("mealType",meal);}else if(drinkType)params.set("drinkType",drinkType);
    if(query.trim())params.set("q",query.trim());
    void request(`/api/${section==="food"?"food":"drinks"}/logs?${params}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Could not load this history. Downloaded records are preserved.");const rows=await response.json();if(!controller.signal.aborted){setHistory({key:historyKey,...(section==="food"?{foods:rows}:{drinks:rows})});setResourceError("");}}).catch(reason=>{if(!controller.signal.aborted&&!snapshot)setResourceError(String(reason));});
    return()=>controller.abort();
  },[onlineBusiness,request,section,date,meal,drinkType,query,historyKey,snapshot]);
  const foods=(history?.key===historyKey?history.foods:undefined)??snapshot?.foods.filter(row=>dateInEvaOrbit(new Date(row.occurredAt))===date&&(!meal||row.mealType===meal)&&(!q||[foodRecordDisplay(row).title,row.description,row.foodPlaceName??""].some(value=>value.toLocaleLowerCase().includes(q))))??[];
  const drinks=(history?.key===historyKey?history.drinks:undefined)??snapshot?.drinks.filter(row=>(!drinkType||row.drinkType===drinkType)&&(!q||[drinkRecordName(row),row.notes,row.foodPlaceName??""].some(value=>value.toLocaleLowerCase().includes(q))))??[];
  function LocalLink({href,children,...props}:FoodLinkProps){return <a {...props} href={href} onClick={event=>{event.preventDefault();const place=/^\/food\/places\/([1-9][0-9]*)$/.exec(href);if(place){setPlaceId(Number(place[1]));setSection("place");}else if(href==="/food/places")setSection("places");else if(href==="/food/library")setSection("library");else if(href==="/food-drink")setSection("home");else if(href==="/food")setSection("food");else if(href==="/drinks/history")setSection("drink");else return;setQuery("");window.scrollTo(0,0);}}>{children}</a>;}
  return <FoodLocalData account={account} platform={platform} Link={LocalLink} onIssue={setResourceError}><FormPreview>
    <div className="page local-food-status"><DevelopmentDetails><p role="status" className="tracker-settings-help">Downloaded offline · {snapshot?`${snapshot.window.from} – ${snapshot.window.to} · Downloaded ${new Date(snapshot.capturedAt).toLocaleString()}`:"Not downloaded"}</p><p className="tracker-settings-help">Up to 500 food and 500 drink records from the last 30 days. Places and Library cache up to 200 places and 100 items; only downloaded details are available offline. Changes save online; offline writes are not queued.</p>{snapshot&&(!snapshot.window.foodComplete||!snapshot.window.drinkComplete)&&<p role="status">Record limit reached. Downloaded history is partial.</p>}</DevelopmentDetails>{error&&<ErrorNotice>{error}</ErrorNotice>}{resourceError&&<ErrorNotice>{resourceError}</ErrorNotice>}</div>
    {section==="places"?<FoodPlacesView/>:section==="library"?<FoodLibraryView/>:section==="place"?<FoodPlaceDetailContent key={placeId} id={placeId} onRemoved={()=>setSection("places")}/>:section==="home"?<FoodDrinkHomeView data={snapshot?.home??null} loading={loading} error={snapshot?"":error} onRetry={()=>void load(new AbortController().signal)} onRecord={setEditor} onLimit={setLimitEditor} LinkComponent={LocalLink} readOnly={!onlineBusiness} action={<button className="button primary" onClick={()=>setEditor({kind:"food"})}>Log</button>}/>:<><div className="page local-food-back"><button className="back-link text-button" onClick={()=>{setSection("home");setQuery("");}}>Back to Food & Drink</button></div>
      {loading&&!snapshot?<PageLoading/>:section==="food"?<FoodRecordsView date={date} setDate={setDate} query={query} setQuery={setQuery} mealFilter={meal} setMealFilter={setMeal} logs={foods} action={<PageLogAction label="Record food" onClick={()=>setEditor({kind:"food"})}>Log</PageLogAction>} renderSources={log=><FoodSourceLinks record={log}/>} onOpen={record=>setEditor({kind:"food",record})} readOnly={!onlineBusiness} emptyMessage={!snapshot?"No downloaded records.":date<snapshot.window.from||date>snapshot.window.to?"This date is outside the downloaded window.":"No matching downloaded records"}/>:<DrinkRecordsView logs={drinks} logScope={<PageLogAction label="Record drink" onClick={()=>setEditor({kind:"drink"})}>Log</PageLogAction>} query={query} setQuery={setQuery} type={drinkType} setType={setDrinkType} onOpen={record=>setEditor({kind:"drink",record})} readOnly={!onlineBusiness} LinkComponent={LocalLink} emptyMessage={!snapshot?"No downloaded records.":"No matching downloaded records"}/>}</>}
    {limitEditor&&<LimitEditor limit={limitEditor==="new"?undefined:limitEditor} onClose={()=>setLimitEditor(null)} onSaved={()=>load(new AbortController().signal)}/>}
    {editor&&<FoodPreviewEditor editor={editor} date={date} onClose={()=>setEditor(null)}/>}
  </FormPreview></FoodLocalData>;
}
