"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { useLocale } from "@/components/locale-controller";
import { filterRelationPeople, sortRelationPeople, type RelationPeopleSort, type RelationshipStatusFilter } from "@/lib/relation-people-view";
import type { RelationPersonSummary } from "@/lib/types";
import { RelationEventEditor } from "./relation-event-editor";
import { RelationPersonEditor } from "./relation-person-editor";

const preferenceKey="evaorbit.relations.view.v1";
const amount=(n:number)=>`${n>=0?"+":"−"}¥${(Math.abs(n)/100).toFixed(2)}`;
const eventLabel:Record<string,string>={expense:"支出",gift:"礼物",repayment:"还款",favor:"人情",interaction:"互动"};
const closenessLabel:Record<number,string>={5:"非常亲近",4:"亲近",3:"一般",2:"疏远",1:"非常疏远"};
const sortLabel:Record<RelationPeopleSort,string>={last_met:"最近见面",latest_event:"最近往来",closeness:"亲近程度",name:"姓名"};
const dateLabel=(value:string,hasTime:boolean|null)=>hasTime?new Date(value).toLocaleString():new Date(value).toLocaleDateString();

function sortedContext(person:RelationPersonSummary,sort:RelationPeopleSort,english:boolean){
  if(sort==="last_met")return person.lastMetAt?`${english?"Last met":"最近见面"} · ${dateLabel(person.lastMetAt,person.lastMetHasExplicitTime)}`:english?"No in-person meetings yet":"还没有见面记录";
  if(sort==="closeness")return person.closenessRank?`${english?"Closeness":"亲近程度"} · ${english?({5:"Very close",4:"Close",3:"Neutral",2:"Distant",1:"Very distant"} as Record<number,string>)[person.closenessRank]:closenessLabel[person.closenessRank]}`:english?"Closeness not set":"未设置亲近程度";
  if(sort==="name")return person.relationLabel??(english?"Relationship not set":"未设置关系");
  return person.latestEvent?`${english?({expense:"Expense",gift:"Gift",repayment:"Repayment",favor:"Favor",interaction:"Interaction"} as Record<string,string>)[person.latestEvent.eventType]:eventLabel[person.latestEvent.eventType]} · ${person.latestEvent.title} · ${dateLabel(person.latestEvent.occurredAt,person.latestEvent.occurredHasExplicitTime)}`:english?"No exchanges yet":"暂无往来";
}

function ViewOptions({sort,status,onSort,onStatus,english}:{sort:RelationPeopleSort;status:RelationshipStatusFilter;onSort:(value:RelationPeopleSort)=>void;onStatus:(value:RelationshipStatusFilter)=>void;english:boolean}){
  const sorts:[RelationPeopleSort,string][]=[["last_met",english?"Last met":"最近见面"],["latest_event",english?"Latest exchange":"最近往来"],["closeness",english?"Closeness":"亲近程度"],["name",english?"Name":"姓名"]];
  const statuses:[RelationshipStatusFilter,string][]=[["all",english?"All":"全部"],["active",english?"Current":"当前关系"],["ended",english?"Ended":"已结束"]];
  return <div className="relations-view-options"><fieldset><legend>排序</legend>{sorts.map(([value,label])=><label key={value}><input type="radio" name="relations-sort" checked={sort===value} onChange={()=>onSort(value)}/><span>{label}</span></label>)}</fieldset><fieldset><legend>关系状态</legend>{statuses.map(([value,label])=><label key={value}><input type="radio" name="relations-status" checked={status===value} onChange={()=>onStatus(value)}/><span>{label}</span></label>)}</fieldset><p>搜索范围包含所有未归档人物，也包括已结束的关系。</p></div>;
}

export function RelationsView({initialPeople}:{initialPeople:RelationPersonSummary[]}){
  const{english}=useLocale();
  const[people,setPeople]=useState(initialPeople),[query,setQuery]=useState("");
  const[sort,setSort]=useState<RelationPeopleSort>("latest_event"),[status,setStatus]=useState<RelationshipStatusFilter>("active"),[preferenceReady,setPreferenceReady]=useState(false);
  const[panel,setPanel]=useState<"person"|"event"|"view"|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>{try{const saved=JSON.parse(localStorage.getItem(preferenceKey)??"null") as {sort?:RelationPeopleSort;status?:RelationshipStatusFilter}|null;if(saved?.sort&&["last_met","latest_event","closeness","name"].includes(saved.sort))setSort(saved.sort);if(saved?.status&&["all","active","ended"].includes(saved.status))setStatus(saved.status);}catch{}setPreferenceReady(true);});return()=>window.cancelAnimationFrame(frame);},[]);
  useEffect(()=>{if(preferenceReady)localStorage.setItem(preferenceKey,JSON.stringify({sort,status}));},[preferenceReady,sort,status]);
  const visible=useMemo(()=>sortRelationPeople(filterRelationPeople(people,query,status),sort),[people,query,sort,status]);
  async function load(){const response=await fetch("/api/relations/people");if(response.ok)setPeople(await response.json());}
  const close=()=>setPanel(null);
  return <div className="page relations-page"><PageHeader eyebrow={english?"LIFE":"生活"} title="Relations" description={english?"Organize exchanges, expenses and favors by person.":"按人物整理往来、支出与人情。"} action={<div className="page-actions"><button className="button secondary" onClick={()=>setPanel("person")}><Icon name="plus"/>{english?"Add person":"新增人物"}</button><button className="button primary" onClick={()=>setPanel("event")}><Icon name="plus"/>{english?"Record exchange":"记录往来"}</button></div>}/><div className="relations-toolbar"><label className="relations-search"><Icon name="search"/><input aria-label={english?"Search people":"搜索人物"} placeholder={english?"Search people…":"搜索人物…"} value={query} onChange={event=>setQuery(event.target.value)}/></label><button className="relations-view-button" type="button" onClick={()=>setPanel("view")} aria-label={english?"Sort and filter people":"排序和筛选人物"}><Icon name="more" variant="stroke"/><span>{english?({last_met:"Last met",latest_event:"Latest exchange",closeness:"Closeness",name:"Name"} as Record<RelationPeopleSort,string>)[sort]:sortLabel[sort]}{status!=="all"?` · ${english?(status==="active"?"Current":"Ended"):(status==="active"?"当前":"已结束")}`:""}</span></button></div>{visible.length?<div className="relation-person-list">{visible.map(person=><Link href={`/relations/${person.id}`} className="relation-person-row" key={person.id}><span className="relation-avatar">{person.photoPath?<span style={{backgroundImage:`url(${person.photoPath})`}}/>:<strong>{person.name.slice(0,1)}</strong>}</span><span className="relation-person-copy"><strong className="user-content">{person.name}{person.nickname&&<small> · {person.nickname}</small>}</strong><span className="relation-person-tags">{person.relationLabel&&<em className="user-content">{person.relationLabel}</em>}{person.relationshipStatus==="ended"&&<em>{english?"Ended":"已结束"}</em>}</span><small>{sortedContext(person,sort,english)}</small><small className="relation-social">{english?"Social balance":"社交余额"} {amount(person.balance.socialMinor)}</small></span><span className="relation-attention">{person.balance.settlementMinor!==0&&<em>{english?(person.balance.settlementMinor>0?"To collect":"To repay"):(person.balance.settlementMinor>0?"待收":"待还")} {amount(person.balance.settlementMinor)}</em>}</span><Icon name="arrow" variant="stroke"/></Link>)}</div>:<div className="empty-state"><span className="empty-icon"><Icon name="people"/></span><h2>{english?(query?"No matching people":"No people yet"):(query?"没有匹配的人物":"当前没有人物")}</h2><p>{english?(query?"Try another name or relationship label.":"Adjust the relationship filter or add a person."):(query?"换个姓名或关系标签试试。":"调整关系状态筛选，或新增人物。")}</p>{!query&&<button className="button primary" onClick={()=>setPanel("person")}>{english?"Add person":"新增人物"}</button>}</div>}{panel==="person"&&<FormSheet title={english?"Add person":"新增人物"} onClose={close} submitLabel={english?"Save person":"保存人物"} busy={busy}><RelationPersonEditor onBusy={setBusy} onSaved={()=>{close();void load();}}/></FormSheet>}{panel==="event"&&<FormSheet title={english?"Record exchange":"记录往来"} onClose={close} submitLabel={english?"Save exchange":"保存往来"} busy={busy}><RelationEventEditor people={people} onBusy={setBusy} onSaved={()=>{close();void load();}}/></FormSheet>}{panel==="view"&&<FormSheet title={english?"Sort & filter":"排序与筛选"} onClose={close}><ViewOptions sort={sort} status={status} onSort={setSort} onStatus={setStatus} english={english}/></FormSheet>}</div>;
}
