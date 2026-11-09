import { readMemoryContext, type MemoryContext } from "./memory-context.ts";
import type { MemoryPageReader } from "./memory-pagination";
import type { MemoryRecallChannel, MemoryRecallHit } from "./types";

export function adaptMemoryRecall(result: MemoryContext) {
  const entities = new Map(result.entities.map(hit => [hit.id, hit.record]));
  const sources = new Map(result.sources.map(hit => [hit.id, hit.record]));
  const facts: MemoryRecallHit[] = [];
  for (const hit of [...result.current_facts, ...result.unknown_facts, ...result.historical_facts].sort((a, b) => a.rank - b.rank)) {
    const fact = hit.record;
    const subject = entities.get(fact.subjectEntityId);
    if (!subject) continue;
    const channels: MemoryRecallChannel[] = [];
    if (hit.relevance >= 90) channels.push("exact");
    if (hit.matched_by.some(field => ["predicate", "object_value", "source_excerpt", "source_note", "source_record_id"].includes(field))) channels.push("literal");
    if (!channels.length) channels.push("graph");
    facts.push({
      fact, subject, sources: hit.source_ids.flatMap(id => sources.has(id) ? [sources.get(id)!] : []),
      objectEntity: fact.objectEntityId ? entities.get(fact.objectEntityId) ?? null : null,
      perspectiveEntity: fact.perspectiveEntityId ? entities.get(fact.perspectiveEntityId) ?? null : null,
      channels, score: hit.relevance,
      explanation: channels.join(" + ") + (hit.time_status === "unknown" ? " · validity unknown" : ""),
    });
  }
  const { status, complete, reasons } = result.coverage;
  return { facts, memos: result.memos.map(hit => hit.record), coverage: { status, complete, reasons } };
}

export async function readMemoryRecall(
  readPage: MemoryPageReader, query: string,
  { limit, maxChars, validOn, signal, timeoutMs }: { limit?: number; maxChars?: number; validOn?: string; signal?: AbortSignal; timeoutMs?: number } = {},
) {
  return adaptMemoryRecall(await readMemoryContext(readPage, { query, limit, max_chars: maxChars }, { today: validOn, signal, timeoutMs }));
}
