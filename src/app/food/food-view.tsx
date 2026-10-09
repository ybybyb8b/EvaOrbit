"use client";

import Link from "next/link";
import { foodRecordDisplay } from "@/lib/food-record-display";
import { useCallback,useEffect,useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icons";
import type { FoodLog } from "@/lib/types";
import { subscribeDataChanged } from "@/lib/data-changed";
import { FoodRecordEditor, meals, scenes, tasteLabels } from "./food-record-editor";

function shiftDate(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

export function FoodView({initialDate,initialMealType}:{initialDate?:string;initialMealType?:string}={}){
  const today=new Date().toLocaleDateString("en-CA");const[date,setDate]=useState(initialDate??today);const[mealFilter,setMealFilter]=useState(meals.some(meal=>meal.value===initialMealType)?initialMealType!:"");const[query,setQuery]=useState("");const[logs,setLogs]=useState<FoodLog[]>([]);const[editing,setEditing]=useState<FoodLog>();const[showForm,setShowForm]=useState(false);
  const load=useCallback(async()=>{const params=new URLSearchParams({date});if(mealFilter)params.set("mealType",mealFilter);if(query)params.set("q",query);const recordsResponse=await fetch(`/api/food/logs?${params}`);if(recordsResponse.ok)setLogs(await recordsResponse.json());},[date,mealFilter,query]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),120);return()=>clearTimeout(timer);},[load]);
  useEffect(()=>subscribeDataChanged(["calendar"],()=>{void load();}),[load]);
  function edit(item:FoodLog){setEditing(item);setShowForm(true);}
  return <div className="page food-page"><PageHeader eyebrow="Food & Drink" title="Food records" action={<button className="button primary" onClick={()=>{setEditing(undefined);setShowForm(true);}}><Icon name="plus"/>新增记录</button>}/>
    {showForm&&<FoodRecordEditor date={date} record={editing} initialMealType={meals.find(meal=>meal.value===mealFilter)?.value} onClose={()=>setShowForm(false)} onSaved={load} onDeleted={load}/>}
    <div className="food-record-grid"><div className="food-toolbar"><div className="food-date-nav"><button type="button" aria-label="前一天" onClick={()=>setDate(shiftDate(date,-1))}>‹</button><input aria-label="选择日期" type="date" value={date} onChange={event=>setDate(event.target.value)}/><button type="button" aria-label="后一天" onClick={()=>setDate(shiftDate(date,1))}>›</button></div><label className="search-box food-search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="找吃过的…"/></label></div><div className="chip-row food-meal-filters"><button className={!mealFilter?"active":""} onClick={()=>setMealFilter("")}>全部</button>{meals.map(meal=><button className={mealFilter===meal.value?"active":""} onClick={()=>setMealFilter(meal.value)} key={meal.value}>{meal.label}</button>)}</div>
    {logs.length?<div className="food-log-list">{logs.map(log=>{const display=foodRecordDisplay(log);return <article className="food-log-card" key={log.id}><div><span>{meals.find(meal=>meal.value===log.mealType)?.label} · {scenes.find(scene=>scene.value===log.scene)?.label} · {log.occurredHasExplicitTime===false?"日期记录":new Date(log.occurredAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</span><h2 className="user-content">{display.title}</h2>{log.calendarMeal&&<p className="food-meal-time">用餐时段 {new Date(log.calendarMeal.startAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}–{new Date(log.calendarMeal.endAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})} · 时间来自日历</p>}{log.foodPlaceName&&<p className="food-log-place user-content">{log.foodPlaceId?<Link href={`/food/places/${log.foodPlaceId}`}>{log.foodPlaceName}</Link>:log.foodPlaceName}{[log.foodPlaceCity,log.foodPlaceLocation,log.foodPlaceBranch].filter(Boolean).map((value,index)=><span key={index}> · {value}</span>)}</p>}{display.dishes.length>0&&<div className="food-linked-dishes" aria-label="关联菜品">{display.dishes.map(dish=><span className="user-content" key={dish.id}>{dish.name}</span>)}</div>}{log.description&&<p>{log.description}</p>}<small>{[log.rating?tasteLabels[log.rating]:"",log.kcalMin!==null&&log.kcalMax!==null?`${log.kcalMin}–${log.kcalMax} kcal`:log.estimatedKcal!==null?`约 ${log.estimatedKcal} kcal`:"未估算热量",`可信度${log.confidence==="high"?"高":log.confidence==="medium"?"中":"低"}`].filter(Boolean).join(" · ")}</small></div><div className="row-actions"><button aria-label={`编辑 ${log.title}`} onClick={()=>edit(log)}><Icon name="edit"/></button></div></article>;})}</div>:<div className="empty-state"><h2>当天暂无饮食记录</h2></div>}</div>
  </div>;
}
