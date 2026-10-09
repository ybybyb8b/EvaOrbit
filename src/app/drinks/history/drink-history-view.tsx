"use client";

import { SearchableSelect } from "@/components/searchable-select";
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
    <PageHeader eyebrow="Food & Drink" title="Drink records" action={<Link className="button secondary" href="/food-drink"><Icon name="arrow"/>Food & Drink</Link>}/>
    <div className="drink-history-toolbar"><label className="search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="找饮品、品牌、店铺或地点…"/></label><SearchableSelect label="饮品类型" searchable={false} value={type} onValueChange={value=>setType(value as DrinkType|"")} options={[{value:"",label:"全部类型"},...drinkTypes.map(([value,label])=>({value,label}))]}/></div>
    {logs.length?<div className="drink-record-list">{logs.map(log=><DrinkRecordCard log={log} onEdit={setEditing} showDate key={log.id}/>)}</div>:<div className="empty-state"><h2>没有匹配的饮品记录</h2><p>换一个饮品、品牌、店铺或类型试试。</p></div>}
    {editing&&<DrinkRecordEditor record={editing} suggestions={suggestions} onClose={()=>setEditing(undefined)} onSaved={load} onDeleted={load}/>} 
  </div>;
}
