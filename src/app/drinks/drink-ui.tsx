"use client";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { SearchableSelect } from "@/components/searchable-select";
import { FoodNameInput } from "../food/food-name-input";
import type { FoodCatalogItem } from "@/lib/food-catalog";
import { showActionToast } from "@/components/action-toast";

import { calculateFoodKcal, foodNutritionReference } from "@/lib/food-calculation";
import { drinkRecordName } from "@/lib/drink-display";
import Link from "next/link";
import { FoodLinkPicker } from "../food/food-link-picker";
import { FoodDeleteAction } from "../food/food-delete-action";
import styles from "./drink-place.module.css";
import formStyles from "../food/food-record-editor.module.css";
import editorStyles from "./drink-record-editor.module.css";
import { useEffect, useState } from "react";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import { DRINK_TEMPERATURES, SUGAR_LEVELS, TASTE_RATINGS } from "@/lib/types";
import type { FoodPlace, ApiError, DrinkInputSuggestions, DrinkLog, FoodNutritionReference, DrinkTemperature, DrinkType, EstimateConfidence, SugarLevel, TasteRating } from "@/lib/types";

export { DRINK_TYPE_OPTIONS as drinkTypes } from "@/lib/drink-types";
import { DRINK_TYPE_OPTIONS as drinkTypes } from "@/lib/drink-types";
import { drinkTypeLabels } from "@/lib/drink-display";
export const temperatureLabels: Record<DrinkTemperature,string> = { normal_ice:"正常冰",less_ice:"少冰",no_ice:"去冰",room_temperature:"常温",hot:"热" };
export const tasteLabels: Record<TasteRating,string> = { love:"好喝",good:"还行",neutral:"一般",dislike:"难喝" };

type Draft = { foodLibraryId:string;drinkMenuId:string;foodPlaceId:string;occurredAt:string;name:string;brand:string;drinkType:DrinkType;consumedVolumeMl:string;volumeMl:string;caffeineMg:string;sugarLevel:SugarLevel;temperature:DrinkTemperature|"";rating:TasteRating|"";estimatedKcal:string;kcalMin:string;kcalMax:string;confidence:EstimateConfidence;notes:string };
function editableSugarLevel(value:string):SugarLevel { if(value==="五分糖")return "半糖";return value===""||SUGAR_LEVELS.some(level=>level===value)?value as SugarLevel:""; }
function emptyDraft(initialDate?:string):Draft{return{foodLibraryId:"",drinkMenuId:"",foodPlaceId:"",occurredAt:initialDate??currentLocalDate(),name:"",brand:"",drinkType:"other",consumedVolumeMl:"",volumeMl:"",caffeineMg:"",sugarLevel:"",temperature:"",rating:"",estimatedKcal:"",kcalMin:"",kcalMax:"",confidence:"medium",notes:""};}
function draftFromRecord(record?:DrinkLog,initialDate?:string):Draft{return record?{foodLibraryId:record.foodLibraryId?.toString()??"",drinkMenuId:record.drinkMenuId?.toString()??"",foodPlaceId:record.foodPlaceId?.toString()??"",occurredAt:compactDateTimeValue(record.occurredAt,record.occurredHasExplicitTime),name:record.name,brand:record.brand,drinkType:record.drinkType,consumedVolumeMl:record.consumedVolumeMl?.toFixed(2)??"",volumeMl:record.volumeMl?.toString()??"",caffeineMg:record.caffeineMg?.toString()??"",sugarLevel:editableSugarLevel(record.sugarLevel),temperature:record.temperature??"",rating:record.rating??"",estimatedKcal:record.estimatedKcal?.toString()??"",kcalMin:record.kcalMin?.toString()??"",kcalMax:record.kcalMax?.toString()??"",confidence:record.confidence,notes:record.notes}:emptyDraft(initialDate);}

export function DrinkRecordEditor({record,initialDate,onClose,onSaved,onDeleted}:{record?:DrinkLog;suggestions:DrinkInputSuggestions;initialDate?:string;onClose:()=>void;onSaved:()=>Promise<void>|void;onDeleted?:()=>Promise<void>|void}){
  const[draft,setDraft]=useState<Draft>(()=>draftFromRecord(record,initialDate));const[saving,setSaving]=useState(false);const[error,setError]=useState("");
  const [nutritionReference,setNutritionReference]=useState<FoodNutritionReference|null>(record?.nutritionReference??null);
  const [amountChanged,setAmountChanged]=useState(false);
  useEffect(()=>{
    if(!draft.foodLibraryId || nutritionReference)return;
    const controller=new AbortController();
    void fetch(`/api/food/library/${draft.foodLibraryId}`,{signal:controller.signal}).then(async response=>{if(response.ok){const item=await response.json();if(!controller.signal.aborted)setNutritionReference(foodNutritionReference(item));}}).catch(()=>{});
    return()=>controller.abort();
  },[draft.foodLibraryId,nutritionReference]);
  function changeVolume(value:string){setAmountChanged(true);const amount=value===""?null:Number(value);const kcal=nutritionReference?calculateFoodKcal(nutritionReference,amount,"ml"):null;setDraft({...draft,consumedVolumeMl:value,estimatedKcal:kcal?.toFixed(2)??""});}
  const [chosen,setChosen]=useState<FoodCatalogItem>();
  const [browseQuery,setBrowseQuery]=useState("");
  const [places,setPlaces]=useState<FoodPlace[]>([]),[placeQuery,setPlaceQuery]=useState("");
  const [placeLoading,setPlaceLoading]=useState(false),[placeError,setPlaceError]=useState(""),[placeAttempt,setPlaceAttempt]=useState(0);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{setPlaceLoading(true);setPlaceError("");void fetch(`/api/food/places?purpose=drink&limit=200&q=${encodeURIComponent(placeQuery)}`,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error("店铺加载失败，请重试");return response.json() as Promise<FoodPlace[]>;}).then(items=>setPlaces(current=>[...new Map([...current,...items].map(item=>[item.id,item])).values()])).catch(reason=>{if(reason.name!=="AbortError")setPlaceError(reason.message);}).finally(()=>{if(!controller.signal.aborted)setPlaceLoading(false);});},150);return()=>{clearTimeout(timer);controller.abort();};},[placeQuery,placeAttempt]);
  const placeOptions=[...new Map([...(record?.foodPlaceId&&record.foodPlaceName?[{id:record.foodPlaceId,name:record.foodPlaceName}]:[]),...(chosen?.placeId?[{id:chosen.placeId,name:chosen.placeName}]:[]),...places.map(place=>({id:place.id,name:place.name,detail:[place.city,place.location,place.branch].filter(Boolean).join(" · ")}))].map(place=>[place.id,place])).values()];
  function selectItem(item:FoodCatalogItem){setChosen(item);setBrowseQuery("");setNutritionReference(item.library?foodNutritionReference(item.library):null);setDraft({...draft,name:item.name,foodPlaceId:item.placeId?.toString()??"",drinkMenuId:item.menu?.id.toString()??"",foodLibraryId:item.library?.id.toString()??"",drinkType:item.menu?.drinkType??item.library?.drinkType??"other",estimatedKcal:(draft.consumedVolumeMl!=="" && item.library?calculateFoodKcal(foodNutritionReference(item.library),Number(draft.consumedVolumeMl),"ml"):draft.consumedVolumeMl===""?item.servingKcal:null)?.toFixed(2)??"",kcalMin:"",kcalMax:""});}
  function manualName(name:string){setChosen(undefined);setNutritionReference(null);setDraft({...draft,name,foodLibraryId:"",drinkMenuId:"",foodPlaceId:"",...(chosen?{estimatedKcal:"",kcalMin:"",kcalMax:""}:{})});}
  async function submit(event:React.FormEvent){event.preventDefault();if(saving)return;setSaving(true);setError("");try{const occurred=compactDateTimePayload(draft.occurredAt);const body={...draft,consumedVolumeMl:draft.consumedVolumeMl!==""?Number(draft.consumedVolumeMl):null,drinkMenuId:draft.drinkMenuId?Number(draft.drinkMenuId):null,foodPlaceId:draft.foodPlaceId?Number(draft.foodPlaceId):null,occurredAt:occurred.value,occurredHasExplicitTime:occurred.hasExplicitTime,temperature:draft.temperature||null,rating:draft.rating||null,volumeMl:draft.volumeMl?Number(draft.volumeMl):null,caffeineMg:draft.caffeineMg?Number(draft.caffeineMg):null,estimatedKcal:draft.estimatedKcal?Number(draft.estimatedKcal):amountChanged?undefined:null,kcalMin:draft.kcalMin?Number(draft.kcalMin):null,kcalMax:draft.kcalMax?Number(draft.kcalMax):null,foodLibraryId:draft.foodLibraryId?Number(draft.foodLibraryId):null};const response=await fetch(record?`/api/drinks/logs/${record.id}`:"/api/drinks/logs",{method:record?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok){const result=await response.json().catch(()=>null) as ApiError|null;setError(result?.error||`无法保存饮品记录（${response.status}）`);return;}invalidateCachedJson("/api/drinks/suggestions");await onSaved();onClose();}catch(reason){setError(reason instanceof Error?reason.message:"无法保存饮品记录");}finally{setSaving(false);}}
  async function remove(){if(!record||!onDeleted||saving)return;setSaving(true);setError("");try{const response=await fetch(`/api/drinks/logs/${record.id}`,{method:"DELETE"});if(!response.ok)throw new Error("无法删除饮品记录，请重试");invalidateCachedJson("/api/drinks/suggestions");await onDeleted();showActionToast("饮品记录已删除","deleted");onClose();}finally{setSaving(false);}}
  return <FormSheet title={record?"改饮品记录":"补一杯"} onClose={onClose} formId="drink-record-form" submitLabel={record?"改好了":"记下"} busy={saving} busyLabel={record?"正在修改…":"正在保存…"}><form id="drink-record-form" className={`editor-card compact-editor ${formStyles.editor}`} onSubmit={submit}>
    <FoodNameInput kind="drink" label="喝了什么" value={draft.name} onValueChange={manualName} onSelect={selectItem}/>
    {(chosen?.placeName||record?.foodPlaceName)&&draft.foodPlaceId&&<p className="muted user-content">{chosen?.placeName??record?.foodPlaceName}</p>}
    <DateTimeField inline label="日期" value={{date:draft.occurredAt.slice(0,10),time:draft.occurredAt.length>10?draft.occurredAt.slice(11,16):""}} onChange={value=>setDraft({...draft,occurredAt:value.date+(value.time?`T${value.time}`:"")})}/>
    <div className={editorStyles.compactFields}>
      <div className="field"><span>类型</span>{(chosen?.menu?.drinkType??chosen?.library?.drinkType)?<p className="muted">{drinkTypeLabels[draft.drinkType]}</p>:<SearchableSelect label="类型" searchable={false} value={draft.drinkType} onValueChange={(value) =>setDraft({...draft,drinkType:value as DrinkType})} options={[...(draft.drinkType==="water"?[{value:"water",label:"水（历史分类）"}]:[]),...drinkTypes.map(([value,label])=>({value:value,label:label}))]}/>}</div>
      <div className="field"><span>评价</span><SearchableSelect label="评价" searchable={false} clearable value={draft.rating} onValueChange={(value) =>setDraft({...draft,rating:value as TasteRating|""})} options={[{value:"",label:"未评价"},...TASTE_RATINGS.map(value=>({value:value,label:tasteLabels[value]}))]}/></div>
      <div className="field"><span>冷热 / 冰量</span><SearchableSelect label="冷热 / 冰量" searchable={false} clearable value={draft.temperature} onValueChange={(value) =>setDraft({...draft,temperature:value as DrinkTemperature|""})} options={[{value:"",label:"未填写"},...DRINK_TEMPERATURES.map(value=>({value:value,label:temperatureLabels[value]}))]}/></div>
      <div className="field"><span>糖度</span><SearchableSelect label="糖度" searchable={false} clearable presentation="capsules" value={draft.sugarLevel} onValueChange={(value) =>setDraft({...draft,sugarLevel:value as SugarLevel})} options={[{value:"",label:"未填写"},...SUGAR_LEVELS.map(level=>({value:level,label:level}))]}/></div>
    </div>
    <div className={formStyles.amountEnergy}>
    <label className="field"><span>喝了多少（毫升）</span><input type="number" inputMode="decimal" min="0" max="10000" step="0.01" value={draft.consumedVolumeMl} onChange={event=>changeVolume(event.target.value)} onBlur={()=>{if(draft.consumedVolumeMl!==""&&Number.isFinite(Number(draft.consumedVolumeMl))){const formatted=Number(draft.consumedVolumeMl).toFixed(2);if(Number(formatted)!==Number(draft.consumedVolumeMl))changeVolume(formatted);else setDraft({...draft,consumedVolumeMl:formatted});}}}/></label>
    <label className="field"><span>热量估算 kcal（可选）</span><input type="number" inputMode="decimal" min="0" step="any" value={draft.estimatedKcal} onChange={event=>setDraft({...draft,estimatedKcal:event.target.value})}/></label>
    </div>

    <div className={formStyles.browser}>
      <FoodLinkPicker label="店铺" options={placeOptions} selected={draft.foodPlaceId?[Number(draft.foodPlaceId)]:[]} loading={placeLoading} error={placeError} onRetry={()=>setPlaceAttempt(value=>value+1)} onSearch={setPlaceQuery} onChange={ids=>{setChosen(undefined);setNutritionReference(null);setBrowseQuery("");setDraft({...draft,foodPlaceId:ids[0]?.toString()??"",drinkMenuId:"",foodLibraryId:""});}}/>
      {draft.foodPlaceId&&<FoodNameInput key={draft.foodPlaceId} kind="drink" placeId={draft.foodPlaceId} label="店铺饮品" value={browseQuery} onValueChange={setBrowseQuery} onSelect={selectItem}/>}
    </div>

    <label className="field"><span>备注（可选）</span><textarea rows={2} maxLength={2000} value={draft.notes} onChange={event=>setDraft({...draft,notes:event.target.value})}/></label>

    {error&&<p className="form-error" role="alert">{error}</p>}{record&&onDeleted&&<FoodDeleteAction label="删除这条饮品记录" description={`确定删除「${drinkRecordName(record)}」？删除后无法恢复。`} onDelete={remove} disabled={saving}/>}
  </form></FormSheet>;
}

function momentLabel(log:DrinkLog,showDate:boolean,dateOnlyLabel:string){const compact=compactDateTimeValue(log.occurredAt,log.occurredHasExplicitTime);const date=compact.slice(0,10);const time=compact.length>10?compact.slice(11,16):dateOnlyLabel;return showDate?`${date} · ${time}`:time;}
export function DrinkRecordCard({log,onEdit,showDate=false}:{log:DrinkLog;onEdit:(log:DrinkLog)=>void;showDate?:boolean}){const {english}=useLocale();const t=(value:string)=>translateUiCopy(value,english?"en":"zh-CN");const specifications=[log.consumedVolumeMl!=null?`${log.consumedVolumeMl.toFixed(2)} ml`:"",log.volumeMl?`${log.volumeMl} ml`:"",t(log.sugarLevel),log.temperature?t(temperatureLabels[log.temperature]):""].filter(Boolean).join(" · ");const assessment=[log.rating?t(tasteLabels[log.rating]):"",log.kcalMin!==null&&log.kcalMax!==null?`${log.kcalMin}–${log.kcalMax} kcal`:log.estimatedKcal!==null?`${english?"About":"约"} ${log.estimatedKcal} kcal`:t("未估算热量")].filter(Boolean).join(" · ");return <article className="drink-record-card"><button className="drink-record-main" onClick={()=>onEdit(log)}><div className="drink-record-copy"><span>{t(drinkTypeLabels[log.drinkType])} · {momentLabel(log,showDate,t("日期记录"))}</span><h2 className="user-content">{log.drinkMenuName?.trim()||log.name.trim()?drinkRecordName(log):t(drinkRecordName(log))}</h2>{log.brand&&log.brand!==log.foodPlaceName&&<p className="drink-record-brand user-content">{log.brand}</p>}<small className="drink-record-specifications">{specifications}</small><small className="drink-record-assessment">{assessment}</small></div></button><button className="drink-record-edit" aria-label={`编辑 ${drinkRecordName(log)}`} onClick={()=>onEdit(log)}><Icon name="edit"/></button>{log.foodPlaceId&&log.foodPlaceName&&<Link className={`${styles.link} user-content`} href={`/food/places/${log.foodPlaceId}`}>{[log.foodPlaceName,log.foodPlaceCity,log.foodPlaceLocation,log.foodPlaceBranch].filter(Boolean).join(" · ")}</Link>}</article>;}
