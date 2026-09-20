import "server-only";

import { randomUUID } from "node:crypto";
import { ConflictError } from "../errors";
import { parseMemorySourceDraft, parseNewMemoryFact } from "../memory-graph-validation";
import { getRepository } from "../repositories";
import type { MemoryEntityListInput, MemoryEntityPatch, MemoryFactCandidateListInput, MemoryFactListInput, MemoryFactPatch, MemorySourceDraft, MemorySourceListInput, MemorySourcePatch } from "../repositories/types";
import { dateInEvaOrbit } from "../time";
import type { MemoryFact, MemoryFactCandidateProposer, MemoryGraphSnapshot, MemoryRecallChannel, MemoryRecallHit } from "../types";
import { ValidationError } from "../validation";

export async function listMemoryEntities(input:MemoryEntityListInput={}){return(await getRepository()).listMemoryEntities(input);}
export async function getMemoryEntity(id:string){return(await getRepository()).getMemoryEntity(id);}
export async function getMemoryEntityDetail(id:string){const repository=await getRepository(),entity=await repository.getMemoryEntity(id);if(!entity)return null;return{entity,facts:await repository.listMemoryFacts({entityId:id,direction:"both",limit:200})};}
export async function createMemoryEntity(input:{canonicalName:string;entityType:string;aliases:string[];description:string|null}){return(await getRepository()).createMemoryEntity({id:randomUUID(),...input,status:"active"});}
export async function updateMemoryEntity(id:string,input:MemoryEntityPatch){return(await getRepository()).updateMemoryEntity(id,input);}
export async function setMemoryEntityArchived(id:string,archived:boolean){return(await getRepository()).setMemoryEntityArchived(id,archived);}
export async function mergeMemoryEntities(sourceId:string,targetId:string){return(await getRepository()).mergeMemoryEntities(sourceId,targetId);}

export async function listMemoryFacts(input:MemoryFactListInput={}){return(await getRepository()).listMemoryFacts(input);}
export async function getMemoryFact(id:string){return(await getRepository()).getMemoryFact(id);}
export async function getMemoryFactDetail(id:string){const repository=await getRepository(),fact=await repository.getMemoryFact(id);if(!fact)return null;return{fact,sources:await repository.listMemorySources({factId:id,limit:200})};}

async function assertActiveEntities(fact:Pick<MemoryFact,"subjectEntityId"|"objectEntityId"|"perspectiveEntityId">){const repository=await getRepository();const ids=[fact.subjectEntityId,fact.objectEntityId,fact.perspectiveEntityId].filter((id):id is string=>Boolean(id));for(const id of new Set(ids)){const entity=await repository.getMemoryEntity(id);if(!entity||entity.status!=="active")throw new ConflictError(`Memory Entity ${id} is missing or inactive.`);}}
export async function createMemoryFact(input:Omit<MemoryFact,"id"|"status"|"invalidatedAt"|"invalidationReason"|"createdAt"|"updatedAt">){await assertActiveEntities(input);return(await getRepository()).createMemoryFact({id:randomUUID(),...input,status:"active"});}
export async function createMemoryFactWithSources(input:Omit<MemoryFact,"id"|"status"|"invalidatedAt"|"invalidationReason"|"createdAt"|"updatedAt">,sources:MemorySourceDraft[]){if(!sources.length)throw new ValidationError("正式 Fact 至少需要一个来源");await assertActiveEntities(input);const repository=await getRepository(),id=randomUUID();return repository.createMemoryFactWithSources({id,...input,status:"active"},sources.map(source=>({id:randomUUID(),factId:id,...source})));}
export async function supersedeMemoryFact(oldFactId:string,input:Omit<MemoryFact,"id"|"status"|"invalidatedAt"|"invalidationReason"|"createdAt"|"updatedAt"|"supersedesFactId">,sources:MemorySourceDraft[]){if(!sources.length)throw new ValidationError("替代 Fact 至少需要一个来源");await assertActiveEntities(input);const repository=await getRepository(),id=randomUUID();return repository.supersedeMemoryFact(oldFactId,{id,...input,supersedesFactId:oldFactId,status:"active"},sources.map(source=>({id:randomUUID(),factId:id,...source})));}
export async function updateMemoryFact(id:string,input:MemoryFactPatch){return(await getRepository()).updateMemoryFact(id,input);}
export async function invalidateMemoryFact(id:string,reason:string|null){return(await getRepository()).invalidateMemoryFact(id,reason);}
export async function restoreMemoryFact(id:string){return(await getRepository()).restoreMemoryFact(id);}

export async function listMemorySources(input:MemorySourceListInput={}){return(await getRepository()).listMemorySources(input);}
export async function getMemorySource(id:string){return(await getRepository()).getMemorySource(id);}
export async function createMemorySource(input:{factId:string;sourceResource:string;sourceRecordId:string|null;sourceUrl:string|null;excerpt:string|null;note:string|null}){const repository=await getRepository();if(!await repository.getMemoryFact(input.factId))throw new ConflictError("Memory Fact not found.");return repository.createMemorySource({id:randomUUID(),...input});}
export async function updateMemorySource(id:string,input:MemorySourcePatch){return(await getRepository()).updateMemorySource(id,input);}
export async function deleteMemorySource(id:string){return(await getRepository()).deleteMemorySource(id);}

export async function listMemoryFactCandidates(input:MemoryFactCandidateListInput={}){return(await getRepository()).listMemoryFactCandidates(input);}
export async function proposeMemoryFactCandidate(value:{fact:unknown;sources:unknown[];proposedBy?:MemoryFactCandidateProposer;proposerModel?:string|null}){const fact=parseNewMemoryFact(value.fact),sources=(value.sources??[]).map(parseMemorySourceDraft);if(!sources.length)throw new ValidationError("候选 Fact 至少需要一个来源");const proposedBy=value.proposedBy??"model";if(!["user","model","system","import"].includes(proposedBy))throw new ValidationError("proposedBy 格式不正确");return(await getRepository()).createMemoryFactCandidate({id:randomUUID(),proposedFact:fact,proposedSources:sources,proposedBy,proposerModel:value.proposerModel?.trim()||null});}
export async function promoteMemoryFactCandidate(id:string,reviewNote:string|null){const repository=await getRepository(),candidate=await repository.getMemoryFactCandidate(id);if(!candidate||candidate.status!=="pending")return null;await assertActiveEntities(candidate.proposedFact);return repository.promoteMemoryFactCandidate(id,randomUUID(),candidate.proposedSources.map(()=>randomUUID()),reviewNote);}
export async function rejectMemoryFactCandidate(id:string,reviewNote:string|null){return(await getRepository()).rejectMemoryFactCandidate(id,reviewNote);}

export async function getMemoryGraphSnapshot():Promise<MemoryGraphSnapshot>{const repository=await getRepository();const[entities,facts,sources,candidates]=await Promise.all([repository.listMemoryEntities({includeMerged:true,limit:200}),repository.listMemoryFacts({limit:200}),repository.listMemorySources({limit:200}),repository.listMemoryFactCandidates({limit:100})]);return{entities,facts,sources,candidates};}

function normalized(value:string){return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g," ").trim();}
function terms(value:string){const text=normalized(value),latin=text.match(/[a-z0-9][a-z0-9._-]*/g)??[],cjk=[...text.replace(/[^\p{Script=Han}]/gu,"")],bigrams=cjk.length>1?cjk.slice(0,-1).map((char,index)=>char+cjk[index+1]):cjk;return[...new Set([...latin,...bigrams])];}
function valueText(value:unknown){return value===null?"":typeof value==="string"?value:JSON.stringify(value);}
function validFact(fact:MemoryFact,today:string){return fact.status==="active"&&(!fact.validFrom||fact.validFrom<=today)&&(!fact.validTo||fact.validTo>=today);}

export async function recallMemory(query:string,limit=8):Promise<MemoryRecallHit[]>{
  const needle=normalized(query);if(!needle||needle.length<2)return[];
  // ponytail: bounded in-process lexical scan is enough for v0.2; replace with backend FTS when the graph exceeds 200 facts.
  const snapshot=await getMemoryGraphSnapshot(),today=dateInEvaOrbit(),entityById=new Map(snapshot.entities.map(entity=>[entity.id,entity])),sourcesByFact=new Map<string,typeof snapshot.sources>();
  for(const source of snapshot.sources){const current=sourcesByFact.get(source.factId)??[];current.push(source);sourcesByFact.set(source.factId,current);}
  const matchedEntities=new Map<string,"exact"|"literal">();
  for(const entity of snapshot.entities.filter(item=>item.status==="active")){const names=[entity.canonicalName,...entity.aliases].map(normalized);if(names.includes(needle))matchedEntities.set(entity.id,"exact");else if(names.some(name=>name.includes(needle)||needle.includes(name)))matchedEntities.set(entity.id,"literal");}
  const queryTerms=terms(needle),hits:MemoryRecallHit[]=[];
  for(const fact of snapshot.facts.filter(item=>validFact(item,today))){
    const subject=entityById.get(fact.subjectEntityId);if(!subject)continue;const objectEntity=fact.objectEntityId?entityById.get(fact.objectEntityId)??null:null,perspectiveEntity=fact.perspectiveEntityId?entityById.get(fact.perspectiveEntityId)??null:null,sources=sourcesByFact.get(fact.id)??[];
    const document=normalized([subject.canonicalName,...subject.aliases,fact.predicate,objectEntity?.canonicalName,...(objectEntity?.aliases??[]),valueText(fact.objectValue),perspectiveEntity?.canonicalName,...sources.flatMap(source=>[source.excerpt,source.note,source.sourceResource])].filter(Boolean).join(" "));
    const channels=new Set<MemoryRecallChannel>(),touches=[fact.subjectEntityId,fact.objectEntityId,fact.perspectiveEntityId].filter(Boolean) as string[];
    if(touches.some(id=>matchedEntities.get(id)==="exact"))channels.add("exact");
    if(document.includes(needle))channels.add("literal");
    if(touches.some(id=>matchedEntities.has(id)))channels.add("graph");
    const overlap=queryTerms.length?queryTerms.filter(term=>document.includes(term)).length/queryTerms.length:0;if(overlap>=.5)channels.add("lexical");
    if(!channels.size)continue;
    const score=(channels.has("exact")?120:0)+(channels.has("literal")?80:0)+(channels.has("graph")?45:0)+(channels.has("lexical")?Math.round(overlap*40):0)+fact.importance*2+fact.confidence;
    const ordered=["exact","literal","lexical","graph"].filter(channel=>channels.has(channel as MemoryRecallChannel)) as MemoryRecallChannel[];
    hits.push({fact,sources,subject,objectEntity,perspectiveEntity,channels:ordered,score,explanation:`${ordered.join(" + ")} · ${fact.epistemicType} · ${sources.length} source${sources.length===1?"":"s"}`});
  }
  return hits.sort((a,b)=>b.score-a.score||b.fact.importance-a.fact.importance||b.fact.updatedAt.localeCompare(a.fact.updatedAt)).slice(0,Math.min(Math.max(limit,1),20));
}
