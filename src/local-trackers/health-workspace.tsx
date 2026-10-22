import {useLocalInitialPath} from "./routes";
import {createContext,useContext,useCallback,useEffect,useState,type ComponentProps} from "react";
import {HealthViewContent,type HealthViewName} from "@/app/health/health-view-content";
import {HealthRecordsView} from "@/app/health/health-records-view";
import {HealthRecordDetailContent} from "@/app/health/health-record-detail-content";
import {HealthDataProvider,type HealthRead} from "@/components/health-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {buildHealthDashboard} from "@/lib/health-dashboard";
import {readHealthSnapshot,type HealthReadonlySnapshot} from "@/lib/health-readonly";
import {LocalBackAction} from "./navigation-header";
import type {LocalAccount,TrackerPlatform} from "./platform";

const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalHealthLink({href,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);const enabled=/^\/health(?:\?|\/records|$)/.test(href);return <a {...props} href={href} aria-disabled={!enabled||undefined} onClick={event=>{event.preventDefault();if(enabled)navigate(href);}}>{children}</a>;}
const views:HealthViewName[]=["overview","sleep","weight","training","energy","cycle","records"];
export function HealthWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const [snapshot,setSnapshot]=useState<HealthReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[path,setPath]=useState(useLocalInitialPath("/health")),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true,running=false;
    async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const value=await platform.healthSnapshot(account,true);if(alive&&value){setSnapshot(value);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Could not refresh Health; cache preserved");}finally{running=false;if(alive)setBusy(false);}}
    void platform.healthSnapshot(account).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
    const active=(event:Event)=>{const detail=(event as CustomEvent).detail;if(event.type===onlineBusinessChanged&&detail?.accountId!==account.accountId)return;if(event.type===onlineBusinessChanged&&detail?.snapshotUpdated&&detail?.resource==="health"){void platform.healthSnapshot(account).then(value=>{if(alive&&value){setSnapshot(value);setError("");}}).catch(()=>{});return;}if(alive&&navigator.onLine)void refresh();};
    window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);
    return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);};
  },[account,platform,attempt]);
  const read=useOnlineReader(useCallback<HealthRead>(async(url,init)=>{if(!snapshot)throw new Error("Health is not downloaded");return readHealthSnapshot(snapshot,url,init);},[snapshot]));
  const url=new URL(path,"https://offline.invalid"),requested=url.searchParams.get("view") as HealthViewName,view=views.includes(requested)?requested:url.hash==="#weight-title"?"weight":url.hash==="#period-medication-title"?"cycle":url.searchParams.has("training")?"training":"overview";
  function navigate(next:string){if(!/^\/health(?:\?view=(?:overview|sleep|weight|training|energy|cycle|records)|\/records(?:\/[1-9][0-9]*)?)?$/.test(next)){setError("This page is not available in the offline preview");return;}setPath(next);window.scrollTo(0,0);}
  const navigation={push:navigate,refresh:()=>setAttempt(n=>n+1)},id=/^\/health\/records\/([1-9][0-9]*)$/.exec(url.pathname),record=snapshot?.records.find(row=>row.id===Number(id?.[1]));
  return <>
    {path!=="/health"&&<LocalBackAction onBack={()=>navigate(id?"/health/records":"/health")}/>}
    <div className="page local-health-status"><LocalDownloadStatus module="Health" capturedAt={snapshot?.capturedAt} busy={busy} error={error}  refresh={()=>setAttempt(n=>n+1)}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</div>
    {!snapshot?busy?<PageLoading title="健康" englishTitle="Health"/>:<div className="page"><p>Health has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><HealthDataProvider read={read} Link={LocalHealthLink}><FormPreview>
      {url.pathname==="/health/records"?<HealthRecordsView initial={snapshot.records}/>:id?record?<HealthRecordDetailContent key={record.id} initial={record} navigation={navigation}/>:<div className="page"><p>This record is not in the downloaded snapshot.</p></div>:<HealthViewContent key={view} navigation={navigation} view={view} initialSleep={snapshot.sleep} initial={buildHealthDashboard(snapshot.records)} initialEnergy={snapshot.energy} initialEnergyHistory={snapshot.energyHistory} initialTraining={snapshot.training} initialRecentTraining={snapshot.recentTraining} initialTrainingSuggestions={snapshot.suggestions} initialTrainingPlan={snapshot.plan} initialWeights={snapshot.weights} initialWeightSettings={snapshot.weightSettings} initialPeriods={snapshot.periods} initialMenstrualFlows={snapshot.flows} initialMedicationPresets={snapshot.presets} initialMedicationDoses={snapshot.doses} initialMedicationReminders={snapshot.reminders} today={snapshot.today}/ >}
    </FormPreview></HealthDataProvider></Navigate.Provider>}
  </>;
}
