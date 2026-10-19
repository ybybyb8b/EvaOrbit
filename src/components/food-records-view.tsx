"use client";
import type {ReactNode} from "react";
import {PageHeading as PageHeader} from "./page-heading";
import {FoodRecordCard} from "./food-record-card";
import {Icon} from "./icons";
import {meals} from "@/lib/food-record-labels";
import {shiftDate} from "@/lib/time";
import type {FoodLog} from "@/lib/types";
export function FoodRecordsView({date,setDate,query,setQuery,mealFilter,setMealFilter,logs,onOpen,action,editor,renderSources,readOnly=false,emptyMessage}:{date:string;setDate:(value:string)=>void;query:string;setQuery:(value:string)=>void;mealFilter:string;setMealFilter:(value:string)=>void;logs:FoodLog[];onOpen:(log:FoodLog)=>void;action?:ReactNode;editor?:ReactNode;renderSources?:(log:FoodLog)=>ReactNode;readOnly?:boolean;emptyMessage?:string}){
  return <div className="page food-page"><PageHeader eyebrow="Food & Drink" title="Food records" action={action}/>
    {editor}
    <div className="food-record-grid"><div className="food-toolbar"><div className="food-date-nav"><button type="button" aria-label="前一天" onClick={()=>setDate(shiftDate(date,-1))}>‹</button><input aria-label="选择日期" type="date" value={date} onChange={event=>setDate(event.target.value)}/><button type="button" aria-label="后一天" onClick={()=>setDate(shiftDate(date,1))}>›</button></div><label className="search-box food-search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="找吃过的…"/></label></div><div className="chip-row food-meal-filters"><button className={!mealFilter?"active":""} onClick={()=>setMealFilter("")}>全部</button>{meals.map(meal=><button className={mealFilter===meal.value?"active":""} onClick={()=>setMealFilter(meal.value)} key={meal.value}>{meal.label}</button>)}</div>
    {logs.length?<div className="food-log-list">{logs.map(log=><FoodRecordCard key={log.id} log={log} onOpen={onOpen} readOnly={readOnly} sourceLinks={renderSources?.(log)}/>)}</div>:<div className="empty-state"><h2>{emptyMessage??"当天暂无饮食记录"}</h2></div>}</div>
  </div>;
}
