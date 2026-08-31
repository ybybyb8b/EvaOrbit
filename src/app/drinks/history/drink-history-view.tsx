"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { DrinkInputSuggestions, DrinkLog, DrinkType } from "@/lib/types";
import { DrinkRecordCard, DrinkRecordEditor, drinkTypes } from "../drink-ui";

export function DrinkHistoryView(){
  const[logs,setLogs]=useState<DrinkLog[]>([]);const[suggestions,setSuggestions]=useState<DrinkInputSuggestions>({names:[],brands:[]});const[query,setQuery]=useState("");const[type,setType]=useState<DrinkType|"">("");const[editing,setEditing]=useState<DrinkLog>();
  const load=useCallback(async()=>{const params=new URLSearchParams();if(query.trim())params.set("q",query.trim());if(type)params.set("drinkType",type);const[recordsResponse,suggestionsResponse]=await Promise.all([fetch(`/api/drinks/logs?${params}`),fetch("/api/drinks/suggestions")]);if(recordsResponse.ok)setLogs(await recordsResponse.json());if(suggestionsResponse.ok)setSuggestions(await suggestionsResponse.json());},[query,type]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),150);return()=>clearTimeout(timer);},[load]);
  return <div className="page drinks-page drink-history-page">
    <PageHeader eyebrow="DRINKS" title="History" description="按实际发生日期浏览、查找和修订过去的饮品记录。" action={<Link className="button secondary" href="/drinks"><Icon name="arrow"/>返回 Drinks</Link>}/>
    <div className="drink-history-toolbar"><label className="search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="找名称或 Brand…"/></label><select aria-label="饮品类型" value={type} onChange={event=>setType(event.target.value as DrinkType|"")}><option value="">全部类型</option>{drinkTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div>
    {logs.length?<div className="drink-record-list">{logs.map(log=><DrinkRecordCard log={log} onEdit={setEditing} showDate key={log.id}/>)}</div>:<div className="empty-state"><h2>没有匹配的饮品记录</h2><p>换一个名称、Brand 或类型试试。</p></div>}
    {editing&&<DrinkRecordEditor record={editing} suggestions={suggestions} onClose={()=>setEditing(undefined)} onSaved={load} onDeleted={load}/>} 
  </div>;
}
