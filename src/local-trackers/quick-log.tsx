import {OnlineForms,useOnlineReader,useOnlineBusiness} from "./online-business";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ComponentProps} from "react";
import {InboxCaptureForm} from "@/app/inbox/inbox-capture-form";
import {CatRecordEditor} from "@/app/cats/cat-record-editor";
import {getHealthQuickLog} from "@/app/health/health-quick-log";
import {useBottomLog} from "@/components/bottom-log-core";
import {QuickLogPicker,QuickLogTrigger} from "@/components/quick-log-picker";
import {QUICK_LOG_OPTIONS,type QuickEntryKind} from "@/components/quick-log-options";
import {HealthDataProvider,type HealthRead} from "@/components/health-data-context";
import {CatsDataProvider,type CatsRead} from "@/components/cats-data-context";
import {FormSheet} from "@/components/form-sheet";
import {FormPreview} from "@/components/form-preview";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {showActionToast} from "@/components/action-toast";
import {useLocale} from "@/components/locale-controller";
import {Icon} from "@/components/icons";
import {TrackerEntryEditor} from "@/app/trackers/tracker-entry-editor";
import {dateInEvaOrbit} from "@/lib/time";
import {canEditTrackerRecord} from "@/lib/tracker-replica";
import {readHealthSnapshot,type HealthReadonlySnapshot} from "@/lib/health-readonly";
import {readCatsSnapshot,type CatsReadonlySnapshot} from "@/lib/cats-readonly";
import {asField,belongs} from "./tracker-records";
import {trackerSession,saveLocalTrackerEntry,synchronizeTrackerSession} from "./tracker-session";
import {LocalTrackerPicture} from "./tracker-picture";
import {FoodPreviewEditor} from "./food-workspace";
import {isPreviewAccount,type LocalAccount,type TrackerPlatform} from "./platform";

function PreviewLink({children,...props}:ComponentProps<"a">&{href:string}){return <a {...props} aria-disabled onClick={event=>event.preventDefault()}>{children}</a>;}

export function LocalQuickLog({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const onlineBusiness=useOnlineBusiness();
  const action=useBottomLog(),{english}=useLocale();
  const store=useMemo(()=>trackerSession(account,platform),[account,platform]);
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [active,setActive]=useState<"picker"|QuickEntryKind|null>(null),[error,setError]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null),[loading,setLoading]=useState(false);
  const [date,setDate]=useState(dateInEvaOrbit),[health,setHealth]=useState<HealthReadonlySnapshot|null>(null),[cats,setCats]=useState<CatsReadonlySnapshot|null>(null);
  const generation=useRef(0),saving=useRef(false);
  const readOnly=platform.readOnly(account);
  const close=()=>{generation.current++;setActive(null);setSelectedId(null);setLoading(false);setError("");};
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    let alive=true;
    const resume=async()=>{
      if(readOnly||isPreviewAccount(account))return;
      try{await store.initialize();}catch(reason){if(alive)setError(String(reason));return;}
      if(alive&&store.getSnapshot().outbox.length)await synchronizeTrackerSession(account,platform).catch(()=>{});
    };
    const refresh=()=>{if(document.visibilityState!=="hidden")void resume();};
    void resume();
    window.addEventListener("online",refresh);window.addEventListener("evaorbit:native-active",refresh);document.addEventListener("visibilitychange",refresh);
    const timer=window.setInterval(refresh,60000);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener("online",refresh);window.removeEventListener("evaorbit:native-active",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[account,platform,store,readOnly]);
  function syncSaved(){
    showActionToast(english?"Saved on this device.":"已保存到本机");close();
    if(!readOnly&&!isPreviewAccount(account))void synchronizeTrackerSession(account,platform).catch(()=>{});
  }
  async function choose(kind:QuickEntryKind){
    const request=++generation.current;setError("");setLoading(true);
    try{
      if(kind==="tracker")await store.initialize();
      if(getHealthQuickLog(kind)){
        const value=await platform.healthSnapshot(account);
        if(!value)throw new Error(english?"Open Health online to download its data first.":"请先联网打开 Health 下载数据。");
        if(request!==generation.current)return;setHealth(value);
      }
      if(kind==="cats"){
        const value=await platform.catsSnapshot(account);
        if(!value)throw new Error(english?"Open Cats online to download its data first.":"请先联网打开 Cats 下载数据。");
        if(request!==generation.current)return;setCats(value);
      }
      if(request===generation.current)setActive(kind);
    }catch(reason){if(request===generation.current)setError(reason instanceof Error?reason.message:String(reason));}
    finally{if(request===generation.current)setLoading(false);}
  }
  const selected=state.records.find(row=>row.resourceType==="tracker"&&row.id===selectedId);
  const hidden=new Set(state.outbox.filter(item=>item.operation==="delete").map(item=>item.localId));
  const trackers=state.records.filter(row=>row.resourceType==="tracker"&&!row.payload.archivedAt&&!hidden.has(row.id));
  const readHealth=useOnlineReader(useCallback<HealthRead>(async(path,init)=>{if(!health)throw new Error("Health is not downloaded");return readHealthSnapshot(health,path,init);},[health]));
  const readCats=useOnlineReader(useCallback<CatsRead>(async(path,init)=>{if(!cats)throw new Error("Cats is not downloaded");return readCatsSnapshot(cats,path,init);},[cats]));
  const healthDefinition=getHealthQuickLog(active),HealthEditor=healthDefinition?.Editor;
  async function selectTracker(id:string){
    const row=trackers.find(item=>item.id===id);if(!row||saving.current)return;
    if(readOnly||!canEditTrackerRecord(row)||!row.payload.quickCaptureEnabled){setSelectedId(id);return;}
    saving.current=true;setLoading(true);setError("");
    try{await saveLocalTrackerEntry(store,row,{});syncSaved();}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{saving.current=false;setLoading(false);}
  }
  const trackerEditor=selected&&<TrackerEntryEditor trackerId={selected.serverId??0} initialDate={date} fields={state.records.filter(row=>row.resourceType==="tracker_field"&&belongs(row,selected)).map(asField).sort((a,b)=>a.sortOrder-b.sortOrder)} onClose={close} onSaved={syncSaved} saveRecord={async input=>{
    if(readOnly||platform.readOnly(account))throw new Error("Read-only mode cannot save");
    await saveLocalTrackerEntry(store,selected,input);
  }}/>;
  const options=action?.picker?QUICK_LOG_OPTIONS.filter(option=>option.kind===action.picker):QUICK_LOG_OPTIONS;
  return <>
    <QuickLogTrigger label={action?.label} disabled={action?.disabled||loading} onClick={()=>{
      if(action?.disabled||loading)return;if(action?.onClick){action.onClick();return;}
      setDate(action?.selectedDate??dateInEvaOrbit());setError("");setActive("picker");if(action?.picker)void choose(action.picker);
    }}/>
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    {active==="picker"&&<FormSheet title={action?.label??(english?"Quick Log":"快速记录")} onClose={close} busy={loading}><QuickLogPicker options={options} disabled={loading} onChoose={kind=>void choose(kind)}/>{loading&&<p role="status">{english?"Loading downloaded data…":"正在读取本机数据…"}</p>}<DevelopmentDetails><p>{english?"Tracker records save on this device and sync when available. Other forms save online; offline changes are not queued.":"Tracker 记录保存到本机，联网后同步。其他表单联网保存，离线不排队上传。"}</p></DevelopmentDetails></FormSheet>}
    {active==="inbox"&&<OnlineForms><FormSheet title="Inbox" onClose={close} formId="local-inbox-capture" submitLabel={english?"Save":"记下"} submitDisabled={!onlineBusiness}><InboxCaptureForm sheet formId="local-inbox-capture" onSaved={close}/></FormSheet></OnlineForms>}
    {(active==="food"||active==="drink")&&<FoodPreviewEditor date={date} editor={{kind:active}} onClose={close}/>}
    {HealthEditor&&health&&<HealthDataProvider read={readHealth} Link={PreviewLink}><OnlineForms><HealthEditor initialDate={date} onClose={close} onSaved={async()=>close()}/></OnlineForms></HealthDataProvider>}
    {active==="cats"&&cats&&<CatsDataProvider read={readCats} Link={PreviewLink}><OnlineForms><FormSheet title={english?"New cat record":"新增猫咪记录"} onClose={close} submitLabel={english?"Save record":"保存记录"} submitDisabled={!onlineBusiness}><CatRecordEditor pets={cats.dashboard.pets.map(item=>item.pet)} initialDate={date} onCancel={close} onSaved={close}/></FormSheet></OnlineForms></CatsDataProvider>}
    {active==="tracker"&&!selected&&<FormSheet title={english?"Choose Tracker":"选择观测"} onClose={close} busy={loading}><div className="home-quick-tracker-list">{trackers.map(row=><button type="button" key={row.id} aria-label={row.payload.quickCaptureEnabled?(english?"Quick record ":"快速记录 ")+String(row.payload.name):String(row.payload.name)} disabled={loading} onClick={()=>void selectTracker(row.id)}><LocalTrackerPicture row={row} state={state} size={38}/><span><strong>{String(row.payload.name)}</strong><small>{String(row.payload.groupName??"")}{row.payload.quickCaptureEnabled?(english?" · Quick":" · 快速"):""}</small></span><Icon name={row.payload.quickCaptureEnabled?"plus":"arrow"} variant="stroke"/></button>)}</div>{!trackers.length&&<p>{english?"No downloaded Trackers.":"暂无已下载的观测。"}</p>}</FormSheet>}
    {active==="tracker"&&selected&&(readOnly||!canEditTrackerRecord(selected)?<FormPreview>{trackerEditor}</FormPreview>:trackerEditor)}
  </>;
}
