import {useState} from "react";
import {Activity,Cup,ForkKnife} from "reicon-react";
import {useBottomLog} from "@/components/bottom-log-core";
import {QuickLogPicker,QuickLogTrigger} from "@/components/quick-log-picker";
import {FormSheet} from "@/components/form-sheet";
import {FormPreview} from "@/components/form-preview";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {TrackerEntryEditor} from "@/app/trackers/tracker-entry-editor";
import type {TrackerLocalState,LocalTrackerRecord} from "@/lib/tracker-local-store";
import {asField,belongs} from "./tracker-workspace";
import {FoodPreviewEditor} from "./food-workspace";
import type {LocalAccount,TrackerPlatform} from "./platform";
export function LocalQuickLog({account,platform}:{account:LocalAccount;platform:TrackerPlatform}){
  const action=useBottomLog();
  const [active,setActive]=useState<"picker"|"food"|"drink"|"tracker"|null>(null),[error,setError]=useState("");
  const [state,setState]=useState<TrackerLocalState|null>(null),[selected,setSelected]=useState<LocalTrackerRecord|null>(null);
  const close=()=>{setActive(null);setSelected(null);setError("");};
  async function choose(kind:"food"|"drink"|"tracker"){
    setActive(kind);
    if(kind==="tracker")try{setState(await platform.storage(account).read());}catch(reason){setError(String(reason));}
  }
  return <><QuickLogTrigger label={action?.label} disabled={action?.disabled} onClick={()=>{if(action?.disabled)return;if(action?.onClick)action.onClick();else setActive("picker");}}/>
    {active==="picker"&&<FormSheet title="Quick Log" onClose={close}><QuickLogPicker options={[{kind:"food",icon:ForkKnife,en:"Food",zh:"饮食"},{kind:"drink",icon:Cup,en:"Drink",zh:"饮品"},{kind:"tracker",icon:Activity,en:"Tracker",zh:"观测"}]} onChoose={kind=>void choose(kind)}/><DevelopmentDetails><p>Form preview only. Other modules will be added as they migrate.</p></DevelopmentDetails></FormSheet>}
    {(active==="food"||active==="drink")&&<FoodPreviewEditor editor={{kind:active}} onClose={close}/>}
    {active==="tracker"&&!selected&&<FormSheet title="Choose Tracker" onClose={close}><div className="home-quick-tracker-list">{state?.records.filter(row=>row.resourceType==="tracker"&&!row.payload.archivedAt&&!state.outbox.some(operation=>operation.localId===row.id&&operation.operation==="delete")).map(row=><button key={row.id} onClick={()=>setSelected(row)}>{String(row.payload.name)}</button>)}</div>{state&&!state.records.some(row=>row.resourceType==="tracker")&&<p>No downloaded Trackers.</p>}{error&&<ErrorNotice>{error}</ErrorNotice>}</FormSheet>}
    {active==="tracker"&&selected&&<FormPreview><TrackerEntryEditor trackerId={selected.serverId??0} fields={(state?.records??[]).filter(row=>row.resourceType==="tracker_field"&&belongs(row,selected)&&!row.payload.archivedAt).map(asField).sort((a,b)=>a.sortOrder-b.sortOrder)} onClose={close} onSaved={()=>{throw new Error("Form preview cannot save");}}/></FormPreview>}
  </>;
}
