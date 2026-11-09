import "server-only";

import { randomUUID } from "node:crypto";
import { ValidationError } from "../validation";
import { ConflictError } from "../errors";
import { parseMemoryCandidateSubmission, parseMemorySourceDraft } from "../memory-graph-validation";
import { getRepository, isMcpRequest, memoryWriteClient } from "../repositories";
import type { MemoryEntityListInput, MemoryEntityPatch, MemoryFactCandidateListInput, MemoryFactListInput, MemoryFactPatch, MemorySourceListInput, MemorySourcePatch } from "../repositories/types";
import type { MemoryFactCandidateStatus, MemoryGraphSnapshot } from "../types";
import type { MemoryPageInput, MemoryResource } from "../memory-pagination";
import { adaptMemoryRecall } from "../memory-recall";
import type { MemoryContextInput } from "../memory-context";
import { getMemoryContext } from "./memory-context";

export async function pageMemory<K extends MemoryResource>(resource: K, input?: MemoryPageInput<K>) {
  return (await getRepository()).pageMemory(resource, input);
}

export async function listMemoryEntities(input:MemoryEntityListInput={}){return(await getRepository()).listMemoryEntities(input);}
export async function getMemoryEntity(id:string){return(await getRepository()).getMemoryEntity(id);}
export async function getMemoryEntityDetail(id: string, options: Pick<MemoryPageInput<"fact">, "cursor" | "limit" | "order"> = {}) {
  const repository = await getRepository(), entity = await repository.getMemoryEntity(id);
  if (!entity) return null;
  const { items: facts, ...factsPage } = await repository.pageMemory("fact", { limit: 200, ...options, entityId: id, direction: "both" });
  return { entity, facts, factsPage };
}
export async function createMemoryEntity(input:{canonicalName:string;entityType:string;aliases:string[];description:string|null}){return(await getRepository()).createMemoryEntity({id:randomUUID(),...input,status:"active"});}
export async function updateMemoryEntity(id:string,input:MemoryEntityPatch){return(await getRepository()).updateMemoryEntity(id,input);}
export async function setMemoryEntityArchived(id:string,archived:boolean){return(await getRepository()).setMemoryEntityArchived(id,archived);}
export async function mergeMemoryEntities(sourceId:string,targetId:string){return(await getRepository()).mergeMemoryEntities(sourceId,targetId);}

export async function listMemoryFacts(input:MemoryFactListInput={}){return(await getRepository()).listMemoryFacts(input);}
export async function getMemoryFact(id:string){return(await getRepository()).getMemoryFact(id);}
export async function getMemoryFactDetail(id: string, options: Pick<MemoryPageInput<"source">, "cursor" | "limit" | "order"> = {}) {
  const repository = await getRepository(), fact = await repository.getMemoryFact(id);
  if (!fact) return null;
  const { items: sources, ...sourcesPage } = await repository.pageMemory("source", { limit: 200, ...options, factId: id });
  const ids = [...new Set([fact.subjectEntityId, fact.objectEntityId, fact.perspectiveEntityId].filter((id): id is string => id !== null))];
  const { items: entities } = await repository.pageMemory("entity", { ids, includeMerged: true });
  return { fact, sources, sourcesPage, entities };
}

export async function updateMemoryFact(id:string,input:MemoryFactPatch){return(await getRepository()).updateMemoryFact(id,input);}
export async function invalidateMemoryFact(id:string,reason:string|null){return(await getRepository()).invalidateMemoryFact(id,reason);}
export async function restoreMemoryFact(id:string){return(await getRepository()).restoreMemoryFact(id);}

export async function listMemorySources(input:MemorySourceListInput={}){return(await getRepository()).listMemorySources(input);}
export async function getMemorySource(id:string){return(await getRepository()).getMemorySource(id);}
export async function createMemorySource(input:{factId:string;sourceResource:string;sourceRecordId:string|null;sourceUrl:string|null;excerpt:string|null;note:string|null}){const repository=await getRepository();if(!await repository.getMemoryFact(input.factId))throw new ConflictError("Memory Fact not found.");return repository.createMemorySource({id:randomUUID(),factId:input.factId,...parseMemorySourceDraft(input)});}
export async function updateMemorySource(id:string,input:MemorySourcePatch){return(await getRepository()).updateMemorySource(id,input);}
export async function deleteMemorySource(id:string){return(await getRepository()).deleteMemorySource(id);}

export async function listMemoryFactCandidates(input:MemoryFactCandidateListInput={}){return(await getRepository()).listMemoryFactCandidates(input);}
export async function getMemoryFactCandidate(id:string){return(await getRepository()).getMemoryFactCandidate(id);}
export async function proposeMemoryFactCandidate(value: unknown, client = "web") {
  const input = parseMemoryCandidateSubmission(value);
  if (isMcpRequest() && !input.requestId) throw new ValidationError("MCP Candidate submit requires a stable request_id UUID. Reuse it with identical content on retries.");
  return (await getRepository()).submitMemoryFactCandidate({ ...input, id: randomUUID(), client, requestId: input.requestId ?? randomUUID() });
}
function assertWebCandidateReview() {
  if (isMcpRequest()) throw new ConflictError("Ordinary Candidate review is available only through the authenticated Web review page.");
}
export async function promoteMemoryFactCandidate(id:string,reviewNote:string|null){assertWebCandidateReview();return(await getRepository()).promoteMemoryFactCandidate(id,reviewNote,memoryWriteClient());}
export async function rejectMemoryFactCandidate(id:string,reviewNote:string|null){assertWebCandidateReview();return(await getRepository()).rejectMemoryFactCandidate(id,reviewNote,memoryWriteClient());}

export async function getMemoryGraphSnapshot(candidateStatus?: MemoryFactCandidateStatus):Promise<MemoryGraphSnapshot>{const repository=await getRepository();const[entities,facts,sources,candidates]=await Promise.all([repository.listMemoryEntities({includeMerged:true,limit:200}),repository.listMemoryFacts({limit:200}),repository.listMemorySources({limit:200}),repository.listMemoryFactCandidates({status:candidateStatus,limit:100})]);return{entities,facts,sources,candidates};}

export async function recallMemory(
  query: string, limit = 8, signal?: AbortSignal, options: Pick<MemoryContextInput, "primary_resource"> = {},
) {
  return adaptMemoryRecall(await getMemoryContext({ query, limit, ...options }, signal));
}
