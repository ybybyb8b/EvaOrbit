"use client";
import type {ReactNode,ComponentType} from "react";
import {PageHeading as PageHeader} from "./page-heading";
import {SearchableSelect} from "./searchable-select";
import {DrinkRecordCard} from "./drink-record-card";
import {Icon} from "./icons";
import {DRINK_TYPE_OPTIONS as drinkTypes} from "@/lib/drink-types";
import type {DrinkType,DrinkLog} from "@/lib/types";
export function DrinkRecordsView({logs,query,setQuery,type,setType,onOpen,LinkComponent,logScope,editor,readOnly=false,emptyMessage}:{logs:DrinkLog[];query:string;setQuery:(value:string)=>void;type:DrinkType|"";setType:(value:DrinkType|"")=>void;onOpen:(value:DrinkLog)=>void;LinkComponent:ComponentType<{href:string;className?:string;children:ReactNode}>;logScope?:ReactNode;editor?:ReactNode;readOnly?:boolean;emptyMessage?:string}){
  return <div className="page drinks-page drink-history-page">
    {logScope}
    <PageHeader eyebrow="Food & Drink" title="Drink records"/>
    <div className="drink-history-toolbar"><label className="search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="找饮品、品牌、店铺或地点…"/></label><SearchableSelect label="饮品类型" searchable={false} value={type} onValueChange={value=>setType(value as DrinkType|"")} options={[{value:"",label:"全部类型"},...drinkTypes.map(([value,label])=>({value,label}))]}/></div>
    {logs.length?<div className="drink-record-list">{logs.map(log=><DrinkRecordCard log={log} onEdit={onOpen} showDate readOnly={readOnly} LinkComponent={LinkComponent} key={log.id}/>)}</div>:<div className="empty-state"><h2>{emptyMessage??"没有匹配的饮品记录"}</h2><p>换一个饮品、品牌、店铺或类型试试。</p></div>}
    {editor}
  </div>;
}
