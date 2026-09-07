import "server-only";

import { randomUUID } from "node:crypto";
import { ConflictError } from "../errors";
import { getRepository } from "../repositories";
import type { MemoryEntityListInput, MemoryEntityPatch, MemoryFactListInput, MemoryFactPatch, MemorySourceListInput, MemorySourcePatch } from "../repositories/types";

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
export async function createMemoryFact(input:{subjectEntityId:string;predicate:string;objectEntityId:string|null;objectValue:unknown|null;perspectiveEntityId:string|null;confidence:number;importance:number;validFrom:string|null;validTo:string|null}){const repository=await getRepository();const ids=[input.subjectEntityId,input.objectEntityId,input.perspectiveEntityId].filter((id):id is string=>Boolean(id));for(const id of new Set(ids)){const entity=await repository.getMemoryEntity(id);if(!entity||entity.status!=="active")throw new ConflictError(`Memory Entity ${id} is missing or inactive.`);}return repository.createMemoryFact({id:randomUUID(),...input,status:"active"});}
export async function updateMemoryFact(id:string,input:MemoryFactPatch){return(await getRepository()).updateMemoryFact(id,input);}
export async function invalidateMemoryFact(id:string,reason:string|null){return(await getRepository()).invalidateMemoryFact(id,reason);}
export async function restoreMemoryFact(id:string){return(await getRepository()).restoreMemoryFact(id);}

export async function listMemorySources(input:MemorySourceListInput={}){return(await getRepository()).listMemorySources(input);}
export async function getMemorySource(id:string){return(await getRepository()).getMemorySource(id);}
export async function createMemorySource(input:{factId:string;sourceResource:string;sourceRecordId:string|null;sourceUrl:string|null;excerpt:string|null;note:string|null}){const repository=await getRepository();if(!await repository.getMemoryFact(input.factId))throw new ConflictError("Memory Fact not found.");return repository.createMemorySource({id:randomUUID(),...input});}
export async function updateMemorySource(id:string,input:MemorySourcePatch){return(await getRepository()).updateMemorySource(id,input);}
export async function deleteMemorySource(id:string){return(await getRepository()).deleteMemorySource(id);}
