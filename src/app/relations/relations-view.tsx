"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
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

function sortedContext(person:RelationPersonSummary,sort:RelationPeopleSort){
  if(sort==="last_met")return person.lastMetAt?`Last met · ${dateLabel(person.lastMetAt,person.lastMetHasExplicitTime)}`:"No in-person meetings yet";
  if(sort==="closeness")return person.closenessRank?`亲近程度 · ${closenessLabel[person.closenessRank]}`:"未设置亲近程度";
  if(sort==="name")return person.relationLabel??"未设置关系";
  return person.latestEvent?`${eventLabel[person.latestEvent.eventType]} · ${person.latestEvent.title} · ${dateLabel(person.latestEvent.occurredAt,person.latestEvent.occurredHasExplicitTime)}`:"暂无往来";
}

function ViewOptions({sort,status,onSort,onStatus}:{sort:RelationPeopleSort;status:RelationshipStatusFilter;onSort:(value:RelationPeopleSort)=>void;onStatus:(value:RelationshipStatusFilter)=>void}){
  const sorts:[RelationPeopleSort,string][]=[["last_met","最近见面"],["latest_event","最近往来"],["closeness","亲近程度"],["name","姓名"]];
  const statuses:[RelationshipStatusFilter,string][]=[["all","全部"],["active","当前关系"],["ended","已结束"]];
  return <div className="relations-view-options"><fieldset><legend>排序</legend>{sorts.map(([value,label])=><label key={value}><input type="radio" name="relations-sort" checked={sort===value} onChange={()=>onSort(value)}/><span>{label}</span></label>)}</fieldset><fieldset><legend>关系状态</legend>{statuses.map(([value,label])=><label key={value}><input type="radio" name="relations-status" checked={status===value} onChange={()=>onStatus(value)}/><span>{label}</span></label>)}</fieldset><p>搜索范围包含所有未归档人物，也包括已结束的关系。</p></div>;
}

export function RelationsView({initialPeople}:{initialPeople:RelationPersonSummary[]}){
  const[people,setPeople]=useState(initialPeople),[query,setQuery]=useState("");
  const[sort,setSort]=useState<RelationPeopleSort>("latest_event"),[status,setStatus]=useState<RelationshipStatusFilter>("active"),[preferenceReady,setPreferenceReady]=useState(false);
  const[panel,setPanel]=useState<"person"|"event"|"view"|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>{try{const saved=JSON.parse(localStorage.getItem(preferenceKey)??"null") as {sort?:RelationPeopleSort;status?:RelationshipStatusFilter}|null;if(saved?.sort&&["last_met","latest_event","closeness","name"].includes(saved.sort))setSort(saved.sort);if(saved?.status&&["all","active","ended"].includes(saved.status))setStatus(saved.status);}catch{}setPreferenceReady(true);});return()=>window.cancelAnimationFrame(frame);},[]);
  useEffect(()=>{if(preferenceReady)localStorage.setItem(preferenceKey,JSON.stringify({sort,status}));},[preferenceReady,sort,status]);
  const visible=useMemo(()=>sortRelationPeople(filterRelationPeople(people,query,status),sort),[people,query,sort,status]);
  async function load(){const response=await fetch("/api/relations/people");if(response.ok)setPeople(await response.json());}
  const close=()=>setPanel(null);
  return <div className="page relations-page"><PageHeader eyebrow="生活" title="Relations" description="按人物整理往来、支出与人情。" action={<div className="page-actions"><button className="button secondary" onClick={()=>setPanel("person")}><Icon name="plus"/>新增人物</button><button className="button primary" onClick={()=>setPanel("event")}><Icon name="plus"/>记录往来</button></div>}/><div className="relations-toolbar"><label className="relations-search"><Icon name="search"/><input aria-label="搜索人物" placeholder="搜索人物…" value={query} onChange={event=>setQuery(event.target.value)}/></label><button className="relations-view-button" type="button" onClick={()=>setPanel("view")} aria-label="排序和筛选人物"><Icon name="more" variant="stroke"/><span>{sortLabel[sort]}{status!=="all"?` · ${status==="active"?"当前":"已结束"}`:""}</span></button></div>{visible.length?<div className="relation-person-list">{visible.map(person=><Link href={`/relations/${person.id}`} className="relation-person-row" key={person.id}><span className="relation-avatar">{person.photoPath?<span style={{backgroundImage:`url(${person.photoPath})`}}/>:<strong>{person.name.slice(0,1)}</strong>}</span><span className="relation-person-copy"><strong>{person.name}{person.nickname&&<small> · {person.nickname}</small>}</strong><span className="relation-person-tags">{person.relationLabel&&<em>{person.relationLabel}</em>}{person.relationshipStatus==="ended"&&<em>已结束</em>}</span><small>{sortedContext(person,sort)}</small><small className="relation-social">社交余额 {amount(person.balance.socialMinor)}</small></span><span className="relation-attention">{person.balance.settlementMinor!==0&&<em>{person.balance.settlementMinor>0?"待收":"待还"} {amount(person.balance.settlementMinor)}</em>}</span><Icon name="arrow" variant="stroke"/></Link>)}</div>:<div className="empty-state"><span className="empty-icon"><Icon name="people"/></span><h2>{query?"没有匹配的人物":"当前没有人物"}</h2><p>{query?"换个姓名或关系标签试试。":"调整关系状态筛选，或新增人物。"}</p>{!query&&<button className="button primary" onClick={()=>setPanel("person")}>新增人物</button>}</div>}{panel==="person"&&<FormSheet title="新增人物" onClose={close} submitLabel="保存人物" busy={busy}><RelationPersonEditor onBusy={setBusy} onSaved={()=>{close();void load();}}/></FormSheet>}{panel==="event"&&<FormSheet title="记录往来" onClose={close} submitLabel="保存往来" busy={busy}><RelationEventEditor people={people} onBusy={setBusy} onSaved={()=>{close();void load();}}/></FormSheet>}{panel==="view"&&<FormSheet title="排序与筛选" onClose={close}><ViewOptions sort={sort} status={status} onSort={setSort} onStatus={setStatus}/></FormSheet>}</div>;
}
