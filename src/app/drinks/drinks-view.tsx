"use client";
import { SearchableSelect } from "@/components/searchable-select";
import { showActionToast } from "@/components/action-toast";

import { currentLocalDate } from "@/components/date-time-field";
import styles from "./drinks-page.module.css";
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
function joined(items:Array<{value:string;count:number}>,label:(value:string)=>string=(value)=>value){return items.length?items.map(item=>`${label(item.value)} ${item.count} 次`).join(" · "):"还没有足够记录";}

export function DrinksView(){
  const today=currentLocalDate();const[logs,setLogs]=useState<DrinkLog[]>([]);const[limits,setLimits]=useState<DrinkLimitStatus[]>([]);const[preferences,setPreferences]=useState(emptyPreferences);const[suggestions,setSuggestions]=useState(emptySuggestions);const[editorOpen,setEditorOpen]=useState(false);const[editing,setEditing]=useState<DrinkLog>();const[showLimitForm,setShowLimitForm]=useState(false);const[editingLimit,setEditingLimit]=useState<number|null>(null);const[limitDraft,setLimitDraft]=useState(emptyLimit);const[error,setError]=useState("");const[saving,setSaving]=useState(false);
  const[loading,setLoading]=useState(true);const[loadError,setLoadError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setLoadError("");try{const[logResponse,limitResponse,suggestionResponse,preferenceResponse]=await Promise.all([fetch(`/api/drinks/logs?date=${today}`),fetch("/api/drinks/limits?status=1"),fetch("/api/drinks/suggestions"),fetch("/api/drinks/preferences")]);if(!logResponse.ok||!limitResponse.ok||!preferenceResponse.ok)throw new Error("饮品数据加载失败，请重试");if(logResponse.ok)setLogs(await logResponse.json());if(limitResponse.ok)setLimits(await limitResponse.json());if(suggestionResponse.ok)setSuggestions(await suggestionResponse.json());if(preferenceResponse.ok)setPreferences(await preferenceResponse.json());}catch(reason){setLoadError(reason instanceof Error?reason.message:"饮品数据加载失败");}finally{setLoading(false);}},[today]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  function openCreate(){setEditing(undefined);setError("");setEditorOpen(true);}function openEdit(log:DrinkLog){setEditing(log);setError("");setEditorOpen(true);}
  function editLimit(limit?:DrinkLimit){setEditingLimit(limit?.id??null);setLimitDraft(limit?{name:limit.name,targetType:limit.targetType,period:limit.period,limitValue:String(limit.limitValue)}:emptyLimit);setShowLimitForm(true);}
  async function submitLimit(event:FormEvent){event.preventDefault();if(saving)return;setError("");setSaving(true);try{const response=await fetch(editingLimit?`/api/drinks/limits/${editingLimit}`:"/api/drinks/limits",{method:editingLimit?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...limitDraft,limitValue:Number(limitDraft.limitValue),enabled:true})});if(!response.ok){setError(((await response.json())as ApiError).error);return;}setLimitDraft(emptyLimit);setEditingLimit(null);setShowLimitForm(false);await load();}finally{setSaving(false);}}
  async function removeLimit(id:number){if(!confirm("删掉这条饮品限制？"))return;const response=await fetch(`/api/drinks/limits/${id}`,{method:"DELETE"});if(!response.ok){setError(((await response.json())as ApiError).error);return;}setShowLimitForm(false);setEditingLimit(null);await load();showActionToast("饮品限制已删除","deleted");}
  return <div className={`page drinks-page ${styles.page}`}>
    <PageHeader eyebrow="生活" title="Drinks" description="记录每一杯，收藏常喝的店铺与饮品。" action={<button className="button primary" onClick={openCreate}><Icon name="plus"/>新增记录</button>}/>
    {editorOpen&&<DrinkRecordEditor record={editing} suggestions={suggestions} onClose={()=>setEditorOpen(false)} onSaved={load} onDeleted={load}/>}
    <nav className={styles.navigation} aria-label="饮品导航"><Link href="/food/places">店铺与菜单 <Icon name="arrow"/></Link><Link href="/drinks/history">饮品历史 <Icon name="arrow"/></Link></nav>
    {loadError&&<div className="form-error" role="alert">{loadError} <button className="text-button" onClick={()=>void load()}>重试</button></div>}
    <section className="drink-today-section"><div className="section-heading drink-today-heading"><h2>今天喝了什么</h2>{!loading&&<span className={styles.todayCount}>{logs.length} 杯</span>}</div>
      {loading&&!logs.length?<div className={styles.loading} role="status">正在读取饮品记录…</div>:logs.length?<div className="drink-record-list">{logs.map(log=><DrinkRecordCard log={log} onEdit={openEdit} key={log.id}/>)}</div>:<div className={`empty-state drink-empty-state ${styles.empty}`}><h2>今天还没记饮品</h2><p>店里买的、自制的，都可以从上方「新增记录」记下。</p></div>}
    </section>
    <div className={styles.secondary}>
    <section className="drink-limits-section"><div className="section-heading"><h2>我设的数量线</h2><button className="text-button" onClick={()=>editLimit()}>设置限制</button></div>
      <div className="drink-limit-list">{limits.length?limits.map(status=><article className={`drink-limit-row ${status.state}`} key={status.limit.id}><div className="drink-limit-copy"><span>{periodLabel(status.limit.period)} · {stateLabel(status.state)}</span><strong>{status.limit.name}</strong></div><div className="drink-limit-count"><strong>{status.count}<small> / {status.limit.limitValue}</small></strong><span>杯</span></div><button className="drink-limit-edit" aria-label={`编辑限制 ${status.limit.name}`} onClick={()=>editLimit(status.limit)}><Icon name="edit"/></button></article>):<div className="drink-limit-empty"><span>暂无限制</span></div>}</div>
      {showLimitForm&&<FormSheet title={editingLimit?"编辑饮品限制":"设置饮品限制"} onClose={()=>{setShowLimitForm(false);setEditingLimit(null);}} formId="drink-limit-form" submitLabel={editingLimit?"保存修改":"设好"} busy={saving}><form id="drink-limit-form" className="editor-card compact-editor" onSubmit={submitLimit}><div className="form-grid"><label className="field"><span>叫什么</span><input required value={limitDraft.name} onChange={event=>setLimitDraft({...limitDraft,name:event.target.value})} placeholder="例如：本周奶茶"/></label><div className="field"><span>限制哪类</span><SearchableSelect label="限制哪类" searchable={false} value={limitDraft.targetType} onValueChange={(value) =>setLimitDraft({...limitDraft,targetType:value})} options={[...drinkTypes.map(([value,label])=>({value:value,label:label}))]}/></div><div className="field"><span>周期</span><SearchableSelect label="周期" searchable={false} value={limitDraft.period} onValueChange={(value) =>setLimitDraft({...limitDraft,period:value as LimitPeriod})} options={[{value:"daily",label:"每天"},{value:"weekly",label:"每周"},{value:"monthly",label:"每月"}]}/></div><label className="field"><span>数量</span><input required min={1} max={1000} type="number" value={limitDraft.limitValue} onChange={event=>setLimitDraft({...limitDraft,limitValue:event.target.value})}/></label></div>{error&&<p className="form-error">{error}</p>}{editingLimit&&<button className="danger-text drink-limit-delete" type="button" onClick={()=>void removeLimit(editingLimit)}>删除这条限制</button>}</form></FormSheet>}
    </section>
    <section className="drink-preference-section"><div className="section-heading"><h2>我的饮品习惯</h2></div>
      {preferences.totalRecords>0?<div className={styles.preferences}>
        <div className={styles.preferenceLeads}>
          <div><h3>常喝的饮品</h3><ul className={styles.preferenceList}>{preferences.commonDrinks.map(item=><li key={`${item.name}-${item.brand}`}><span>{item.name}{item.brand&&<small>{item.brand}</small>}</span><span className={styles.frequency}>{item.count} 次</span></li>)}</ul>{!preferences.commonDrinks.length&&<p className={styles.hint}>有品名后会显示在这里</p>}</div>
          <div><h3>喜欢的饮品</h3><ul className={styles.preferenceList}>{preferences.preferredDrinks.map(item=><li key={`${item.name}-${item.brand}`}><span>{item.name}{item.brand&&<small>{item.brand}</small>}</span></li>)}</ul>{!preferences.preferredDrinks.length&&<p className={styles.hint}>有评价后会更准确</p>}</div>
        </div>
        {preferences.commonBrands.length>0&&<div className={styles.brands}><h3>常喝的品牌</h3><ul className={styles.preferenceList}>{preferences.commonBrands.map(item=><li key={item.value}><span>{item.value}</span><span className={styles.frequency}>{item.count} 次</span></li>)}</ul></div>}
        <dl className={styles.tendencies}>
          <div><dt>常喝类型</dt><dd>{joined(preferences.commonTypes,value=>drinkTypes.find(([type])=>type===value)?.[1]??value)}</dd></div>
          <div><dt>糖度倾向</dt><dd>{joined(preferences.sugarTendency)}</dd></div>
          <div><dt>冷热偏好</dt><dd>{joined(preferences.temperatureTendency,value=>temperatureLabels[value as keyof typeof temperatureLabels]??value)}</dd></div>
        </dl>
        <p className={styles.recent}><span>最近喝过</span>{preferences.recent.length?preferences.recent.map(item=>item.name).filter((value,index,array)=>array.indexOf(value)===index).slice(0,3).join(" · "):"暂无近期记录"}</p>
      </div>:<div className="drink-preference-empty"><p>记录几杯后，再看看常喝的品名、糖度和冷热偏好。</p></div>}
    </section>
    </div>
  </div>;
}
