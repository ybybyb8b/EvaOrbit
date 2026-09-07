"use client";

import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icons";
import type { DailyNutritionSummary,FoodLog } from "@/lib/types";
import { FoodRecordEditor, meals, scenes, tasteLabels } from "./food-record-editor";

function shiftDate(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

export function FoodView(){
  const today=new Date().toLocaleDateString("en-CA");const[date,setDate]=useState(today);const[mealFilter,setMealFilter]=useState("");const[query,setQuery]=useState("");const[logs,setLogs]=useState<FoodLog[]>([]);const[summary,setSummary]=useState<DailyNutritionSummary|null>(null);const[editing,setEditing]=useState<FoodLog>();const[showForm,setShowForm]=useState(false);
  const load=useCallback(async()=>{const params=new URLSearchParams({date});if(mealFilter)params.set("mealType",mealFilter);if(query)params.set("q",query);const[recordsResponse,summaryResponse]=await Promise.all([fetch(`/api/food/logs?${params}`),fetch(`/api/nutrition/daily?date=${date}`)]);if(recordsResponse.ok)setLogs(await recordsResponse.json());if(summaryResponse.ok)setSummary(await summaryResponse.json());},[date,mealFilter,query]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),120);return()=>clearTimeout(timer);},[load]);
  function edit(item:FoodLog){setEditing(item);setShowForm(true);}
  return <div className="page food-page"><PageHeader eyebrow="生活" title="Food" action={<button className="button primary" onClick={()=>{setEditing(undefined);setShowForm(true);}}><Icon name="plus"/>新增记录</button>}/>
    <div className="food-summary"><div><span>摄入估算</span><strong>{summary?summary.intakeMin!==summary.intakeMax?`约 ${summary.intakeMin}–${summary.intakeMax} kcal`:`约 ${summary.estimatedIntakeKcal} kcal`:"—"}</strong><small>可信度：{summary?.confidence==="high"?"高":summary?.confidence==="medium"?"中":"低"}</small></div><div className="summary-links"><Link href="/drinks">今日饮品 <Icon name="arrow"/></Link><Link href="/food/library">Food Library <Icon name="arrow"/></Link><Link href="/food/places">店铺库 <Icon name="arrow"/></Link></div></div>
    {showForm&&<FoodRecordEditor date={date} record={editing} onClose={()=>setShowForm(false)} onSaved={load} onDeleted={load}/>}
    <div className="food-record-grid"><div className="food-toolbar"><div className="food-date-nav"><button type="button" aria-label="前一天" onClick={()=>setDate(shiftDate(date,-1))}>‹</button><input aria-label="选择日期" type="date" value={date} onChange={event=>setDate(event.target.value)}/><button type="button" aria-label="后一天" onClick={()=>setDate(shiftDate(date,1))}>›</button></div><label className="search-box food-search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="找吃过的…"/></label></div><div className="chip-row food-meal-filters"><button className={!mealFilter?"active":""} onClick={()=>setMealFilter("")}>全部</button>{meals.map(meal=><button className={mealFilter===meal.value?"active":""} onClick={()=>setMealFilter(meal.value)} key={meal.value}>{meal.label}</button>)}</div>
    {logs.length?<div className="food-log-list">{logs.map(log=><article className="food-log-card" key={log.id}><div><span>{meals.find(meal=>meal.value===log.mealType)?.label} · {scenes.find(scene=>scene.value===log.scene)?.label} · {new Date(log.occurredAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</span><h2>{log.title}</h2>{(log.foodPlaceName||log.foodDishName)&&<p className="food-log-place">{log.foodPlaceName}{log.foodPlaceBranch?` · ${log.foodPlaceBranch}`:""}{log.foodDishName?` / ${log.foodDishName}`:""}</p>}{log.description&&<p>{log.description}</p>}<small>{[log.rating?tasteLabels[log.rating]:"",log.kcalMin!==null&&log.kcalMax!==null?`${log.kcalMin}–${log.kcalMax} kcal`:log.estimatedKcal!==null?`约 ${log.estimatedKcal} kcal`:"未估算热量",`可信度${log.confidence==="high"?"高":log.confidence==="medium"?"中":"低"}`].filter(Boolean).join(" · ")}</small></div><div className="row-actions"><button aria-label={`编辑 ${log.title}`} onClick={()=>edit(log)}><Icon name="edit"/></button></div></article>)}</div>:<div className="empty-state"><h2>当天暂无饮食记录</h2></div>}</div>
  </div>;
}
