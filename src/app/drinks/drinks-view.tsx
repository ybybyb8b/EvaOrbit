"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import type { ApiError, DrinkInputSuggestions, DrinkLimit, DrinkLimitStatus, DrinkLog, DrinkPreferenceSummary, LimitPeriod } from "@/lib/types";
import { DrinkRecordCard, DrinkRecordEditor, drinkTypes, temperatureLabels } from "./drink-ui";

const emptyLimit={name:"",targetType:"coffee",period:"weekly" as LimitPeriod,limitValue:""};
const emptySuggestions:DrinkInputSuggestions={names:[],brands:[]};
const emptyPreferences:DrinkPreferenceSummary={totalRecords:0,commonTypes:[],commonDrinks:[],preferredDrinks:[],commonBrands:[],sugarTendency:[],temperatureTendency:[],recent:[]};
function periodLabel(period:LimitPeriod){return period==="daily"?"今天":period==="weekly"?"本周":"本月";}
function stateLabel(state:DrinkLimitStatus["state"]){return state==="exceeded_limit"?"已超过":state==="reached_limit"?"已到上限":state==="near_limit"?"接近上限":"范围内";}
function joined(items:Array<{value:string;count:number}>,label:(value:string)=>string=(value)=>value){return items.length?items.map(item=>`${label(item.value)} ${item.count}`).join(" · "):"还没有足够记录";}

export function DrinksView(){
  const today=new Date().toLocaleDateString("en-CA");const[logs,setLogs]=useState<DrinkLog[]>([]);const[limits,setLimits]=useState<DrinkLimitStatus[]>([]);const[preferences,setPreferences]=useState(emptyPreferences);const[suggestions,setSuggestions]=useState(emptySuggestions);const[editorOpen,setEditorOpen]=useState(false);const[editing,setEditing]=useState<DrinkLog>();const[showLimitForm,setShowLimitForm]=useState(false);const[editingLimit,setEditingLimit]=useState<number|null>(null);const[limitDraft,setLimitDraft]=useState(emptyLimit);const[error,setError]=useState("");const[saving,setSaving]=useState(false);
  const load=useCallback(async()=>{const[logResponse,limitResponse,suggestionResponse,preferenceResponse]=await Promise.all([fetch(`/api/drinks/logs?date=${today}`),fetch("/api/drinks/limits?status=1"),fetch("/api/drinks/suggestions"),fetch("/api/drinks/preferences")]);if(logResponse.ok)setLogs(await logResponse.json());if(limitResponse.ok)setLimits(await limitResponse.json());if(suggestionResponse.ok)setSuggestions(await suggestionResponse.json());if(preferenceResponse.ok)setPreferences(await preferenceResponse.json());},[today]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  function openCreate(){setEditing(undefined);setError("");setEditorOpen(true);}function openEdit(log:DrinkLog){setEditing(log);setError("");setEditorOpen(true);}
  function editLimit(limit?:DrinkLimit){setEditingLimit(limit?.id??null);setLimitDraft(limit?{name:limit.name,targetType:limit.targetType,period:limit.period,limitValue:String(limit.limitValue)}:emptyLimit);setShowLimitForm(true);}
  async function submitLimit(event:FormEvent){event.preventDefault();if(saving)return;setError("");setSaving(true);try{const response=await fetch(editingLimit?`/api/drinks/limits/${editingLimit}`:"/api/drinks/limits",{method:editingLimit?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...limitDraft,limitValue:Number(limitDraft.limitValue),enabled:true})});if(!response.ok){setError(((await response.json())as ApiError).error);return;}setLimitDraft(emptyLimit);setEditingLimit(null);setShowLimitForm(false);await load();}finally{setSaving(false);}}
  async function removeLimit(id:number){if(!confirm("删掉这条饮品限制？"))return;await fetch(`/api/drinks/limits/${id}`,{method:"DELETE"});setShowLimitForm(false);setEditingLimit(null);await load();}
  return <div className="page drinks-page">
    <PageHeader eyebrow="生活" title="Drinks" action={<button className="button primary" onClick={openCreate}><Icon name="plus"/>新增记录</button>}/>
    {editorOpen&&<DrinkRecordEditor record={editing} suggestions={suggestions} onClose={()=>setEditorOpen(false)} onSaved={load} onDeleted={load}/>}
    <section className="drink-today-section"><div className="section-heading drink-today-heading"><div><span className="eyebrow">TODAY</span><h2>今天喝了什么</h2></div></div>
      {logs.length?<div className="drink-record-list">{logs.map(log=><DrinkRecordCard log={log} onEdit={openEdit} key={log.id}/>)}</div>:<div className="empty-state drink-empty-state"><h2>今天暂无饮品记录</h2></div>}
    </section>
    <section className="drink-limits-section"><div className="section-heading"><div><span className="eyebrow">LIMITS</span><h2>我设的数量线</h2></div><button className="text-button" onClick={()=>editLimit()}>设置限制</button></div>
      <div className="drink-limit-list">{limits.length?limits.map(status=><article className={`drink-limit-row ${status.state}`} key={status.limit.id}><div className="drink-limit-copy"><span>{periodLabel(status.limit.period)} · {stateLabel(status.state)}</span><strong>{status.limit.name}</strong></div><div className="drink-limit-count"><strong>{status.count}<small> / {status.limit.limitValue}</small></strong><span>杯</span></div><button className="drink-limit-edit" aria-label={`编辑限制 ${status.limit.name}`} onClick={()=>editLimit(status.limit)}><Icon name="edit"/></button></article>):<div className="drink-limit-empty"><span>暂无限制</span></div>}</div>
      {showLimitForm&&<FormSheet title={editingLimit?"编辑饮品限制":"设置饮品限制"} onClose={()=>{setShowLimitForm(false);setEditingLimit(null);}} formId="drink-limit-form" submitLabel={editingLimit?"保存修改":"设好"} busy={saving}><form id="drink-limit-form" className="editor-card compact-editor" onSubmit={submitLimit}><div className="form-grid"><label className="field"><span>叫什么</span><input required value={limitDraft.name} onChange={event=>setLimitDraft({...limitDraft,name:event.target.value})} placeholder="例如：本周奶茶"/></label><label className="field"><span>限制哪类</span><select value={limitDraft.targetType} onChange={event=>setLimitDraft({...limitDraft,targetType:event.target.value})}>{drinkTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>周期</span><select value={limitDraft.period} onChange={event=>setLimitDraft({...limitDraft,period:event.target.value as LimitPeriod})}><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label className="field"><span>数量</span><input required min={1} max={1000} type="number" value={limitDraft.limitValue} onChange={event=>setLimitDraft({...limitDraft,limitValue:event.target.value})}/></label></div>{error&&<p className="form-error">{error}</p>}{editingLimit&&<button className="danger-text drink-limit-delete" type="button" onClick={()=>void removeLimit(editingLimit)}>删除这条限制</button>}</form></FormSheet>}
    </section>
    <section className="drink-preference-section"><div className="section-heading"><div><span className="eyebrow">PREFERENCES</span><h2>我的饮品习惯</h2></div><Link className="text-button" href="/drinks/history">查看全部历史 <Icon name="arrow"/></Link></div>
      <div className="drink-preference-grid">
        <article><span>常喝类型</span><strong>{joined(preferences.commonTypes,value=>drinkTypes.find(([type])=>type===value)?.[1]??value)}</strong></article>
        <article><span>常喝名称 / Brand</span><strong>{preferences.commonDrinks.length?`${preferences.commonDrinks.map(item=>`${item.name} ${item.count}`).join(" · ")}${preferences.commonBrands.length?` · Brand ${preferences.commonBrands.map(item=>`${item.value} ${item.count}`).join(" · ")}`:""}`:"还没有足够记录"}</strong></article>
        <article><span>偏好饮品</span><strong>{preferences.preferredDrinks.length?preferences.preferredDrinks.map(item=>`${item.name}${item.brand?` · ${item.brand}`:""}`).join(" · "):"有评价后会更准确"}</strong></article>
        <article><span>糖度倾向</span><strong>{joined(preferences.sugarTendency)}</strong></article>
        <article><span>冷热偏好</span><strong>{joined(preferences.temperatureTendency,value=>temperatureLabels[value as keyof typeof temperatureLabels]??value)}</strong></article>
        <article><span>近期常喝</span><strong>{preferences.recent.length?preferences.recent.map(item=>item.name).filter((value,index,array)=>array.indexOf(value)===index).slice(0,3).join(" · "):"暂无近期记录"}</strong></article>
      </div>
    </section>
  </div>;
}
