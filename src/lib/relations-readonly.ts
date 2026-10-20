import type {PersonMemoryNote,RelationBalance,RelationEvent,RelationPerson,RelationPersonSummary} from "./types";
import {derivePersonBalance,derivePersonRecency,validateRelationEvent} from "./relations.ts";

export type RelationsPersonDetail={person:RelationPerson;balance:RelationBalance;latestEvent:RelationEvent|null;lastMetAt:string|null;lastMetHasExplicitTime:boolean|null;events:RelationEvent[];memoryNotes:PersonMemoryNote[]};
export type RelationsReadonlySnapshot={format:"eo-relations-readonly-v1";accountId:string;capturedAt:string;people:RelationPersonSummary[];details:RelationsPersonDetail[]};
const id=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const timestamp=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
const nullableText=(v:unknown)=>v===null||typeof v==="string";
function fail():never{throw new Error("Invalid or incomplete Relations snapshot; previous cache preserved");}
const sameBalance=(a:RelationBalance,b:RelationBalance)=>a&&b&&Number.isSafeInteger(a.socialMinor)&&Number.isSafeInteger(a.settlementMinor)&&a.socialMinor===b.socialMinor&&a.settlementMinor===b.settlementMinor;
const personFields=["id","name","nickname","relationLabel","closenessRank","relationshipStatus","photoPath","birthday","likes","avoid","note","archivedAt","createdAt","updatedAt"] as const;

export function validateRelationsSnapshot(value:RelationsReadonlySnapshot,accountId:string){
  if(!value||value.format!=="eo-relations-readonly-v1"||value.accountId!==accountId||!timestamp(value.capturedAt)||!Array.isArray(value.people)||value.people.length>100||!Array.isArray(value.details)||value.details.length!==value.people.length)fail();
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Relations snapshot exceeds 8 MiB; previous cache preserved");
  const people=new Map<number,RelationPersonSummary>(),events=new Map<number,string>(),flows=new Map<number,{event:RelationEvent;flow:RelationEvent["flows"][number]}>(),notes=new Set<number>();
  for(const person of value.people){
    if(!person||!id(person.id)||people.has(person.id)||typeof person.name!=="string"||!["active","ended"].includes(person.relationshipStatus)||(person.closenessRank!==null&&![1,2,3,4,5].includes(person.closenessRank))||!timestamp(person.createdAt)||!timestamp(person.updatedAt))fail();
    for(const key of ["nickname","relationLabel","birthday","likes","avoid","note","archivedAt"] as const)if(!nullableText(person[key]))fail();
    if(person.photoPath!==null&&(typeof person.photoPath!=="string"||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(person.photoPath)))fail();
    people.set(person.id,person);
  }
  const seen=new Set<number>();
  for(const detail of value.details){
    const person=detail?.person,summary=people.get(person?.id);
    if(!summary||seen.has(person.id)||personFields.some(key=>person[key]!==summary[key])||!Array.isArray(detail.events)||detail.events.length>=500||!Array.isArray(detail.memoryNotes)||detail.memoryNotes.length>=1000)fail();
    seen.add(person.id);const eventIds=new Set<number>();
    for(const event of detail.events){
      if(!event||!id(event.id)||eventIds.has(event.id)||!timestamp(event.occurredAt)||typeof event.occurredHasExplicitTime!=="boolean"||!timestamp(event.createdAt)||!timestamp(event.updatedAt)||!nullableText(event.note)||!["expense","gift","repayment","favor","interaction"].includes(event.eventType)||!(event.isInPerson===null||typeof event.isInPerson==="boolean")||!Array.isArray(event.parties)||!Array.isArray(event.flows)||!Array.isArray(event.items))fail();
      eventIds.add(event.id);
      const parties=new Set<number>(),items=new Set<number>(),eventFlows=new Set<number>();
      for(const party of event.parties){if(!id(party.id)||parties.has(party.id)||!["self","person"].includes(party.partyType)||(party.partyType==="person"&&!people.has(party.personId!)))fail();parties.add(party.id);}
      if(!event.parties.some(p=>p.personId===person.id))fail();
      for(const item of event.items){if(!id(item.id)||items.has(item.id)||!Number.isSafeInteger(item.sortOrder))fail();items.add(item.id);}
      for(const flow of event.flows){if(!id(flow.id)||eventFlows.has(flow.id)||!nullableText(flow.note)||(flow.settlesFlowId!==null&&!id(flow.settlesFlowId)))fail();eventFlows.add(flow.id);}
      validateRelationEvent({...event,parties:event.parties.map(p=>({...p,key:String(p.id)})),flows:event.flows.map(f=>({...f,fromKey:String(f.fromPartyId),toKey:String(f.toPartyId)}))});
      const serialized=JSON.stringify(event),existing=events.get(event.id);
      if(existing&&existing!==serialized)fail();
      if(!existing){events.set(event.id,serialized);for(const flow of event.flows){if(flows.has(flow.id))fail();flows.set(flow.id,{event,flow});}}
    }
    if(detail.events.some((event,index)=>index>0&&detail.events[index-1].occurredAt<event.occurredAt))fail();
    const balance=derivePersonBalance(detail.events,person.id),recency=derivePersonRecency(detail.events);
    for(const row of [detail,summary])if(!sameBalance(row.balance,balance)||row.latestEvent?.id!==recency.latestEvent?.id||row.lastMetAt!==recency.lastMetAt||row.lastMetHasExplicitTime!==recency.lastMetHasExplicitTime)fail();
    for(const note of detail.memoryNotes){if(!id(note.id)||notes.has(note.id)||note.personId!==person.id||typeof note.content!=="string"||!timestamp(note.createdAt)||!timestamp(note.updatedAt))fail();notes.add(note.id);}
  }
  for(const {event,flow} of flows.values())if(flow.settlesFlowId!==null){
    const source=flows.get(flow.settlesFlowId);
    if(!source||source.flow.flowType!=="advance"||flow.flowType!=="repayment")fail();
    const party=(e:RelationEvent,id:number)=>e.parties.find(p=>p.id===id)!;
    const same=(a:RelationEvent["parties"][number],b:RelationEvent["parties"][number])=>a.partyType===b.partyType&&a.personId===b.personId;
    if(!same(party(source.event,source.flow.fromPartyId),party(event,flow.toPartyId))||!same(party(source.event,source.flow.toPartyId),party(event,flow.fromPartyId)))fail();
  }
  if(events.size>=500)fail();
  const repayments=new Map<number,number>();
  for(const {flow} of flows.values())if(flow.settlesFlowId!==null)repayments.set(flow.settlesFlowId,(repayments.get(flow.settlesFlowId)??0)+flow.amountMinor);
  for(const {flow} of flows.values())if(flow.flowType==="advance"&&(repayments.get(flow.id)??0)>flow.amountMinor)fail();
  return value;
}

export function readRelationsSnapshot(value:RelationsReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Relations read-only adapter refused a write");
  const match=/^\/api\/relations\/people(?:\/([1-9][0-9]*)(\/notes)?)?$/.exec(path);
  if(!match)throw new Error("Relations read-only path refused");
  const detail=value.details.find(row=>row.person.id===Number(match[1]));
  const data=match[1]?match[2]?detail?.memoryNotes:detail:value.people.filter(row=>!row.archivedAt);
  return new Response(JSON.stringify(data??{error:"Not in downloaded Relations snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
