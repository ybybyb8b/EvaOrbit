"use client";

import { useState } from "react";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { DRINK_TEMPERATURES, SUGAR_LEVELS, TASTE_RATINGS } from "@/lib/types";
import type { ApiError, DrinkInputSuggestions, DrinkLog, DrinkTemperature, DrinkType, EstimateConfidence, SugarLevel, TasteRating } from "@/lib/types";

export const drinkTypes: [DrinkType, string][] = [["coffee","咖啡"],["milk_tea","奶茶"],["tea","茶"],["soda","汽水"],["juice","果汁"],["water","水"],["alcohol","酒"],["other","其他"]];
export const temperatureLabels: Record<DrinkTemperature,string> = { normal_ice:"正常冰",less_ice:"少冰",no_ice:"去冰",room_temperature:"常温",hot:"热" };
export const tasteLabels: Record<TasteRating,string> = { love:"好喝",good:"还行",neutral:"一般",dislike:"难喝" };

type Draft = { occurredAt:string;name:string;brand:string;drinkType:DrinkType;volumeMl:string;sugarLevel:SugarLevel;temperature:DrinkTemperature|"";rating:TasteRating|"";estimatedKcal:string;kcalMin:string;kcalMax:string;confidence:EstimateConfidence;notes:string };
function editableSugarLevel(value:string):SugarLevel { if(value==="五分糖")return "半糖";return value===""||SUGAR_LEVELS.some(level=>level===value)?value as SugarLevel:""; }
function emptyDraft():Draft{return{occurredAt:currentLocalDate(),name:"",brand:"",drinkType:"other",volumeMl:"",sugarLevel:"",temperature:"",rating:"",estimatedKcal:"",kcalMin:"",kcalMax:"",confidence:"medium",notes:""};}
function draftFromRecord(record?:DrinkLog):Draft{return record?{occurredAt:compactDateTimeValue(record.occurredAt,record.occurredHasExplicitTime),name:record.name,brand:record.brand,drinkType:record.drinkType,volumeMl:record.volumeMl?.toString()??"",sugarLevel:editableSugarLevel(record.sugarLevel),temperature:record.temperature??"",rating:record.rating??"",estimatedKcal:record.estimatedKcal?.toString()??"",kcalMin:record.kcalMin?.toString()??"",kcalMax:record.kcalMax?.toString()??"",confidence:record.confidence,notes:record.notes}:emptyDraft();}

export function DrinkRecordEditor({record,suggestions,onClose,onSaved,onDeleted}:{record?:DrinkLog;suggestions:DrinkInputSuggestions;onClose:()=>void;onSaved:()=>Promise<void>|void;onDeleted?:()=>Promise<void>|void}){
  const[draft,setDraft]=useState<Draft>(()=>draftFromRecord(record));const[saving,setSaving]=useState(false);const[error,setError]=useState("");
  async function submit(event:React.FormEvent){event.preventDefault();if(saving)return;setSaving(true);setError("");try{const occurred=compactDateTimePayload(draft.occurredAt);const body={...draft,occurredAt:occurred.value,occurredHasExplicitTime:occurred.hasExplicitTime,temperature:draft.temperature||null,rating:draft.rating||null,volumeMl:draft.volumeMl?Number(draft.volumeMl):null,caffeineMg:null,estimatedKcal:draft.estimatedKcal?Number(draft.estimatedKcal):null,kcalMin:draft.kcalMin?Number(draft.kcalMin):null,kcalMax:draft.kcalMax?Number(draft.kcalMax):null,foodLibraryId:null};const response=await fetch(record?`/api/drinks/logs/${record.id}`:"/api/drinks/logs",{method:record?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok){setError(((await response.json())as ApiError).error);return;}await onSaved();onClose();}catch(reason){setError(reason instanceof Error?reason.message:"无法保存饮品记录");}finally{setSaving(false);}}
  async function remove(){if(!record||!onDeleted||!confirm("删掉这条饮品记录？"))return;setSaving(true);setError("");try{const response=await fetch(`/api/drinks/logs/${record.id}`,{method:"DELETE"});if(!response.ok){setError("无法删除饮品记录");return;}await onDeleted();onClose();}finally{setSaving(false);}}
  return <FormSheet title={record?"改饮品记录":"补一杯"} onClose={onClose} formId="drink-record-form" submitLabel={record?"改好了":"记下"} busy={saving} busyLabel={record?"正在修改…":"正在保存…"}><form id="drink-record-form" className="editor-card compact-editor" onSubmit={submit}>
    <DateTimeField label="日期" value={{date:draft.occurredAt.slice(0,10),time:draft.occurredAt.length>10?draft.occurredAt.slice(11,16):""}} onChange={value=>setDraft({...draft,occurredAt:value.date+(value.time?`T${value.time}`:"")})}/>
    <div className="form-grid drink-record-form-grid">
      <label className="field"><span>饮品</span><input required list="drink-name-history" value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
      <label className="field"><span>Brand</span><input list="drink-brand-history" maxLength={120} value={draft.brand} onChange={event=>setDraft({...draft,brand:event.target.value})} placeholder="可不填"/></label>
      <label className="field"><span>类型</span><select value={draft.drinkType} onChange={event=>setDraft({...draft,drinkType:event.target.value as DrinkType})}>{drinkTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>容量 ml</span><input type="number" min="0" max="10000" value={draft.volumeMl} onChange={event=>setDraft({...draft,volumeMl:event.target.value})}/></label>
      <label className="field"><span>糖度</span><select value={draft.sugarLevel} onChange={event=>setDraft({...draft,sugarLevel:event.target.value as SugarLevel})}><option value="">未填写</option>{SUGAR_LEVELS.map(level=><option value={level} key={level}>{level}</option>)}</select></label>
      <label className="field"><span>冷热 / 冰量</span><select value={draft.temperature} onChange={event=>setDraft({...draft,temperature:event.target.value as DrinkTemperature|""})}><option value="">未填写</option>{DRINK_TEMPERATURES.map(value=><option value={value} key={value}>{temperatureLabels[value]}</option>)}</select></label>
      <label className="field"><span>评价</span><select value={draft.rating} onChange={event=>setDraft({...draft,rating:event.target.value as TasteRating|""})}><option value="">未评价</option>{TASTE_RATINGS.map(value=><option value={value} key={value}>{tasteLabels[value]}</option>)}</select></label>
      <label className="field"><span>热量估算</span><input type="number" min="0" value={draft.estimatedKcal} onChange={event=>setDraft({...draft,estimatedKcal:event.target.value})}/></label>
      <label className="field wide"><span>Notes</span><textarea rows={3} maxLength={2000} value={draft.notes} onChange={event=>setDraft({...draft,notes:event.target.value})}/></label>
    </div>
    <datalist id="drink-name-history">{suggestions.names.map(value=><option value={value} key={value}/>)}</datalist><datalist id="drink-brand-history">{suggestions.brands.map(value=><option value={value} key={value}/>)}</datalist>
    {error&&<p className="form-error">{error}</p>}{record&&onDeleted&&<button className="danger-text drink-record-delete" type="button" onClick={()=>void remove()}>删除这条记录</button>}
  </form></FormSheet>;
}

function momentLabel(log:DrinkLog,showDate:boolean){const compact=compactDateTimeValue(log.occurredAt,log.occurredHasExplicitTime);const date=compact.slice(0,10);const time=compact.length>10?compact.slice(11,16):"日期记录";return showDate?`${date} · ${time}`:time;}
export function DrinkRecordCard({log,onEdit,showDate=false}:{log:DrinkLog;onEdit:(log:DrinkLog)=>void;showDate?:boolean}){const details=[log.volumeMl?`${log.volumeMl} ml`:"",log.sugarLevel,log.temperature?temperatureLabels[log.temperature]:"",log.rating?tasteLabels[log.rating]:"",log.kcalMin!==null&&log.kcalMax!==null?`${log.kcalMin}–${log.kcalMax} kcal`:log.estimatedKcal!==null?`约 ${log.estimatedKcal} kcal`:"未估算热量"].filter(Boolean).join(" · ");return <article className="drink-record-card"><button className="drink-record-main" onClick={()=>onEdit(log)}><div className="drink-record-copy"><span>{drinkTypes.find(([value])=>value===log.drinkType)?.[1]} · {momentLabel(log,showDate)}</span><h2>{log.name}</h2>{log.brand&&<p className="drink-record-brand">{log.brand}</p>}<small>{details}</small></div></button><button className="drink-record-edit" aria-label={`编辑 ${log.name}`} onClick={()=>onEdit(log)}><Icon name="edit"/></button></article>;}
