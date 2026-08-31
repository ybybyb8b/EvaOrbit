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
const eventLabel:Record<string,string>={expense:"Expense",gift:"Gift",repayment:"Repayment",favor:"Favor",interaction:"Interaction"};
const closenessLabel:Record<number,string>={5:"Very close",4:"Close",3:"Regular",2:"Distant",1:"Very distant"};
const sortLabel:Record<RelationPeopleSort,string>={last_met:"Last met",latest_event:"Latest exchange",closeness:"Closeness",name:"Name"};
const dateLabel=(value:string,hasTime:boolean|null)=>hasTime?new Date(value).toLocaleString():new Date(value).toLocaleDateString();

function sortedContext(person:RelationPersonSummary,sort:RelationPeopleSort){
  if(sort==="last_met")return person.lastMetAt?`Last met · ${dateLabel(person.lastMetAt,person.lastMetHasExplicitTime)}`:"No in-person meetings yet";
  if(sort==="closeness")return person.closenessRank?`Closeness · ${closenessLabel[person.closenessRank]}`:"Closeness not set";
  if(sort==="name")return person.relationLabel??"Relationship not set";
  return person.latestEvent?`${eventLabel[person.latestEvent.eventType]} · ${person.latestEvent.title} · ${dateLabel(person.latestEvent.occurredAt,person.latestEvent.occurredHasExplicitTime)}`:"No exchanges yet";
}

function ViewOptions({sort,status,onSort,onStatus}:{sort:RelationPeopleSort;status:RelationshipStatusFilter;onSort:(value:RelationPeopleSort)=>void;onStatus:(value:RelationshipStatusFilter)=>void}){
  const sorts:[RelationPeopleSort,string][]=[["last_met","Last met"],["latest_event","Latest exchange"],["closeness","Closeness"],["name","Name"]];
  const statuses:[RelationshipStatusFilter,string][]=[["all","All"],["active","Current relationships"],["ended","Ended"]];
  return <div className="relations-view-options"><fieldset><legend>Sort by</legend>{sorts.map(([value,label])=><label key={value}><input type="radio" name="relations-sort" checked={sort===value} onChange={()=>onSort(value)}/><span>{label}</span></label>)}</fieldset><fieldset><legend>Relationship status</legend>{statuses.map(([value,label])=><label key={value}><input type="radio" name="relations-status" checked={status===value} onChange={()=>onStatus(value)}/><span>{label}</span></label>)}</fieldset><p>Searching checks all non-archived people, including ended relationships.</p></div>;
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
  return <div className="page relations-page"><PageHeader eyebrow="LIFE" title="Relations" description="People-indexed exchanges, expenses, gifts and favors." action={<div className="page-actions"><button className="button secondary" onClick={()=>setPanel("person")}><Icon name="plus"/>Person</button><button className="button primary" onClick={()=>setPanel("event")}><Icon name="plus"/>Exchange</button></div>}/><div className="relations-toolbar"><label className="relations-search"><Icon name="search"/><input aria-label="Search people" placeholder="Find a person…" value={query} onChange={event=>setQuery(event.target.value)}/></label><button className="relations-view-button" type="button" onClick={()=>setPanel("view")} aria-label="Sort and filter people"><Icon name="more" variant="stroke"/><span>{sortLabel[sort]}{status!=="all"?` · ${status==="active"?"Current":"Ended"}`:""}</span></button></div>{visible.length?<div className="relation-person-list">{visible.map(person=><Link href={`/relations/${person.id}`} className="relation-person-row" key={person.id}><span className="relation-avatar">{person.photoPath?<span style={{backgroundImage:`url(${person.photoPath})`}}/>:<strong>{person.name.slice(0,1)}</strong>}</span><span className="relation-person-copy"><strong>{person.name}{person.nickname&&<small> · {person.nickname}</small>}</strong><span className="relation-person-tags">{person.relationLabel&&<em>{person.relationLabel}</em>}{person.relationshipStatus==="ended"&&<em>Ended</em>}</span><small>{sortedContext(person,sort)}</small><small className="relation-social">Social {amount(person.balance.socialMinor)}</small></span><span className="relation-attention">{person.balance.settlementMinor!==0&&<em>{person.balance.settlementMinor>0?"To collect":"To repay"} {amount(person.balance.settlementMinor)}</em>}</span><Icon name="arrow" variant="stroke"/></Link>)}</div>:<div className="empty-state"><span className="empty-icon"><Icon name="people"/></span><h2>{query?"No matching people":"No people in this view"}</h2><p>{query?"Try another name or relationship label.":"Change the relationship status filter or add a person."}</p>{!query&&<button className="button primary" onClick={()=>setPanel("person")}>Add person</button>}</div>}{panel==="person"&&<FormSheet title="Add person" onClose={close} submitLabel="Save person" busy={busy}><RelationPersonEditor onBusy={setBusy} onSaved={()=>{close();void load();}}/></FormSheet>}{panel==="event"&&<FormSheet title="Record an exchange" onClose={close} submitLabel="Save exchange" busy={busy}><RelationEventEditor people={people} onBusy={setBusy} onSaved={()=>{close();void load();}}/></FormSheet>}{panel==="view"&&<FormSheet title="Sort & view" onClose={close}><ViewOptions sort={sort} status={status} onSort={setSort} onStatus={setStatus}/></FormSheet>}</div>;
}
