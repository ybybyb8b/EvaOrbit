import { createHash } from "node:crypto";
import { ValidationError } from "./validation.ts";
import type { MemoListInput, MemoryEntityListInput, MemoryFactListInput, MemorySourceListInput, MemoryFactCandidateListInput } from "./repositories/types";
import type { Memo, MemoryEntity, MemoryFact, MemorySource, MemoryFactCandidate } from "./types";

export type MemoryPageOrder = "display" | "created";
export type MemorySourceMatch = { term: string; field: "source_excerpt" | "source_note" | "source_resource" | "source_record_id" };
export type MemoryPage<T> = { items: T[]; has_more: boolean; next_cursor: string | null };
type MemoryResources = {
  memo: [MemoListInput & { relatedTerms?: string[] }, Memo];
  entity: [MemoryEntityListInput & { ids?: string[]; relatedTerms?: string[] }, MemoryEntity];
  fact: [MemoryFactListInput & { query?: string; relatedTerms?: string[]; ids?: string[]; supersedesIds?: string[]; relatedEntityIds?: string[]; includeSourceMatches?: boolean }, MemoryFact & { sourceMatches?: MemorySourceMatch[] }];
  source: [MemorySourceListInput & { query?: string; factIds?: string[] }, MemorySource];
  candidate: [MemoryFactCandidateListInput, MemoryFactCandidate];
};
export type MemoryResource = keyof MemoryResources;
export type MemoryPageInput<K extends MemoryResource> = MemoryResources[K][0] & { cursor?: string; order?: MemoryPageOrder; signal?: AbortSignal };
export type MemoryPageItem<K extends MemoryResource> = MemoryResources[K][1];
export type MemoryPageReader = <K extends MemoryResource>(resource: K, input?: MemoryPageInput<K>) => Promise<MemoryPage<MemoryPageItem<K>>>;

const tables = { memo: "memos", entity: "memory_entities", fact: "memory_facts", source: "memory_sources", candidate: "memory_fact_candidates" } as const;
export const memoryPageTables = tables;
type Boundary = { time: string; id: string | number; importance?: number };

export function prepareMemoryPage<K extends MemoryResource>(resource: K, owner: string, input: MemoryPageInput<K>) {
  const { limit = 100, cursor, order = "display", signal, ...rawFilters } = input;
  const filters = { ...rawFilters };
  if ("query" in filters && typeof filters.query === "string") filters.query = filters.query.trim();
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ValidationError("Memory page limit must be between 1 and 200.");
  if (order !== "display" && order !== "created") throw new ValidationError("Invalid Memory page order.");
  const sortTime = order === "display" && (resource === "memo" || resource === "entity" || resource === "fact") ? "updated_at" : "created_at";
  const sortImportance = order === "display" && resource === "fact";
  const idDescending = resource === "memo";
  const scope = createHash("sha256").update(JSON.stringify([
    1, resource, owner, order, Object.entries(filters).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)),
  ])).digest("base64url");
  let after: Boundary | null = null;
  if (cursor !== undefined) {
    try {
      if (!/^[a-zA-Z0-9_-]{1,500}$/.test(cursor)) throw new Error();
      const { scope: tokenScope, key } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (tokenScope !== scope || !key || typeof key.time !== "string" || key.time.length > 40 || !Number.isFinite(Date.parse(key.time)) ||
        (resource === "memo" ? !Number.isSafeInteger(key.id) : typeof key.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key.id)) ||
        (sortImportance && (!Number.isInteger(key.importance) || key.importance < 1 || key.importance > 5))) throw new Error();
      after = key;
    } catch {
      throw new ValidationError("Invalid Memory cursor or cursor does not match this request.");
    }
  }
  return { limit, order, signal, filters, sortTime, sortImportance, idDescending, scope, after };
}

export function finishMemoryPage<T extends { id: string | number; createdAt: string; updatedAt?: string }>(
  rows: T[], page: ReturnType<typeof prepareMemoryPage>,
): MemoryPage<T> {
  const has_more = rows.length > page.limit;
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);
  const key = last && { time: page.sortTime === "updated_at" ? last.updatedAt : last.createdAt, id: last.id,
    ...(page.sortImportance && "importance" in last ? { importance: last.importance } : {}) };
  const next_cursor = has_more ? Buffer.from(JSON.stringify({ scope: page.scope, key })).toString("base64url") : null;
  return { items, has_more, next_cursor };
}
