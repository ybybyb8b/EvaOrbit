import { isDeepStrictEqual } from "node:util";
import type { MemoryPage, MemoryPageInput, MemoryPageItem, MemoryPageReader, MemoryResource } from "./memory-pagination";
import { memoryUuid } from "./memory-graph-validation.ts";
import { dateInEvaOrbit } from "./time.ts";
import type { Memo, MemoStatus, MemoType, MemoryEntity, MemoryFact, MemorySource } from "./types";
import { dateOnly, ValidationError } from "./validation.ts";

export type MemoryContextInput = {
  query: string;
  primary_resource?: "fact";
  query_variants?: string[];
  entity_ids?: string[];
  time_mode?: "current" | "as_of" | "history";
  as_of?: string;
  from?: string;
  to?: string;
  memo_type?: MemoType;
  memo_status?: MemoStatus;
  limit?: number;
  max_chars?: number;
};

type TimeStatus = "current" | "as_of" | "historical" | "corrected" | "withdrawn" | "dated" | "unknown" | "not_applicable";
type Hit<K extends string, T extends { id: string | number }> = {
  resource_type: K;
  id: T["id"];
  record: T;
  matched_by: string[];
  matched_terms: string[];
  relevance: number;
  rank: number;
  time_status: TimeStatus;
  entity_ids: string[];
  source_ids: string[];
};
type FactHit = Hit<"fact", MemoryFact> & { sources_complete: boolean };
type MemoHit = Hit<"memo", Memo>;
type EntityHit = Hit<"entity", MemoryEntity>;
type SourceHit = Hit<"source", MemorySource>;
type Primary = FactHit | MemoHit | EntityHit;
type Reason = "result_limit" | "character_budget" | "source_incomplete" | "missing_entity" | "timeout" | "query_failed";
type Notice = { code: "different_assertions" | "validity_unknown" | "event_date_unknown" | "corrected_history" | "missing_source" | "incomplete"; ids?: (string | number)[] };
type Time = { mode: NonNullable<MemoryContextInput["time_mode"]>; date: string; from?: string; to?: string };
type Packet = { version: 1; time: Time; current_facts: FactHit[]; historical_facts: FactHit[]; unknown_facts: FactHit[]; memos: MemoHit[]; entities: EntityHit[]; sources: SourceHit[] };
export type MemoryContext = Packet & {
  query: { original: string; variants: string[]; terms: string[] };
  notices: Notice[];
  coverage: {
    status: "complete" | "partial" | "timeout" | "failed";
    complete: boolean;
    truncated: boolean;
    reasons: Reason[];
    matched_count: number;
    returned_count: number;
  };
  context_text: string;
};

const fold = (value: string) => value.replace(/[A-Z]/g, char => char.toLowerCase());
const unique = <T>(values: T[]) => [...new Set(values)];

function boundedInt(value: unknown, fallback: number, min: number, max: number, field: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(field + " must be between " + min + " and " + max + ".");
  }
  return value;
}

function readInput(input: MemoryContextInput, today: string) {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query || query.length > 20000 || query.includes("\0")) throw new ValidationError("Invalid Memory Context query.");
  const variants = input.query_variants ?? [];
  if (!Array.isArray(variants) || variants.length > 8 || variants.some(value =>
    typeof value !== "string" || !value.trim() || value.trim().length > 160 || value.includes("\0"))) {
    throw new ValidationError("Provide at most 8 nonblank query variants of up to 160 characters.");
  }
  const rawIds = input.entity_ids ?? [];
  if (!Array.isArray(rawIds) || rawIds.length > 20) throw new ValidationError("Provide at most 20 Entity IDs.");
  const ids = unique(rawIds.map(id => memoryUuid(id, "entity_ids")));
  const mode = input.time_mode ?? "current";
  if (mode !== "current" && mode !== "as_of" && mode !== "history") throw new ValidationError("Invalid Memory Context time_mode.");
  if (mode !== "as_of" && input.as_of !== undefined) throw new ValidationError("as_of requires time_mode=as_of.");
  const date = mode === "as_of" ? dateOnly(input.as_of, "as_of") : today;
  const from = input.from === undefined ? undefined : dateOnly(input.from, "from");
  const to = input.to === undefined ? undefined : dateOnly(input.to, "to");
  if (from && to && from > to) throw new ValidationError("from must not follow to.");
  if (input.memo_type !== undefined && !["basic", "supplement", "event", "note"].includes(input.memo_type)) throw new ValidationError("Invalid memo_type.");
  if (input.memo_status !== undefined && !["active", "merged", "archived", "historical"].includes(input.memo_status)) throw new ValidationError("Invalid memo_status.");
  const supplied = unique([query, ...variants.map(value => value.trim())]);
  const words = query.match(/[a-zA-Z0-9][a-zA-Z0-9._-]*|\p{Script=Han}+/gu) ?? [];
  const derived = words.flatMap(word => {
    const chars = [...word];
    return /^\p{Script=Han}{3,}$/u.test(word) ? chars.slice(0, -1).map((char, index) => char + chars[index + 1]) : [word];
  });
  const terms = unique([...supplied, query.normalize("NFKC"), ...derived.slice(0, 16)]);
  return {
    query: { original: query, variants: unique(variants.map(value => value.trim())), terms },
    time: { mode, date, from, to } satisfies Time,
    supplied: new Set(supplied), ids,
    limit: boundedInt(input.limit, 8, 1, 20, "limit"),
    maxChars: boundedInt(input.max_chars, 32000, 1, 250000, "max_chars"),
  };
}

type Match = { field: string; term: string; score: number };
type Terms = { terms: string[]; supplied: Set<string> };

function textMatches(values: (string | null)[], field: string, query: Terms, exact: number, substring: number) {
  const candidates = values.filter((value): value is string => value !== null).map(fold);
  return query.terms.flatMap(term => {
    const needle = fold(term);
    const score = candidates.includes(needle) ? exact : candidates.some(value => value.includes(needle)) ? substring : 0;
    return score ? [{ field, term, score: score + (query.supplied.has(term) ? 2 : 0) }] : [];
  });
}

function entityMatches(entity: MemoryEntity, query: Terms) {
  return [
    ...textMatches([entity.canonicalName], "canonical_name", query, 100, 34),
    ...textMatches(entity.aliases, "alias", query, 90, 32),
  ];
}

function sourceMatches(source: MemorySource, query: Terms) {
  return [
    ...textMatches([source.excerpt], "source_excerpt", query, 62, 58),
    ...textMatches([source.note], "source_note", query, 48, 42),
    ...textMatches([source.sourceResource], "source_resource", query, 46, 40),
    ...textMatches([source.sourceRecordId], "source_record_id", query, 61, 43),
  ];
}

function factFields(value: unknown): { text: string[]; numbers: number[] } {
  const text: string[] = [], numbers: number[] = [];
  function visit(item: unknown) {
    if (typeof item === "number") numbers.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) { text.push(key); visit(child); }
    } else text.push(String(item));
  }
  if (value !== null) visit(value);
  return { text, numbers };
}

function makeHit<K extends string, T extends { id: string | number }>(
  resource_type: K, record: T, matches: Match[], time_status: TimeStatus, entity_ids: string[] = [],
): Hit<K, T> {
  const ranked = [...matches].sort((a, b) => b.score - a.score || a.field.localeCompare(b.field) || a.term.localeCompare(b.term));
  return {
    resource_type, id: record.id, record, time_status, entity_ids, source_ids: [], rank: 0,
    matched_by: unique(ranked.map(match => match.field)), matched_terms: unique(ranked.map(match => match.term).filter(Boolean)),
    relevance: ranked[0]?.score ?? 0,
  };
}

function factTime(fact: MemoryFact, time: Time): TimeStatus | null {
  const { validFrom, validTo } = fact;
  const unknown = validFrom === null && validTo === null;
  if ((time.from || time.to) && (unknown || (time.from && validTo && validTo < time.from) || (time.to && validFrom && validFrom > time.to))) return null;
  if ((validFrom && validFrom > time.date) || (time.mode !== "history" && validTo && validTo < time.date)) return null;
  if (fact.status === "invalidated") return fact.invalidationReason === "superseded" ? "corrected" : "withdrawn";
  if (unknown) return "unknown";
  if (validTo && validTo < time.date) return "historical";
  return time.mode === "as_of" ? "as_of" : "current";
}

const factEntities = (fact: MemoryFact) => unique([fact.subjectEntityId, fact.objectEntityId, fact.perspectiveEntityId].filter((id): id is string => id !== null));
const current = (status: TimeStatus) => status === "current" || status === "as_of";
const priority = (hit: Primary) => current(hit.time_status) ? 2 : hit.resource_type !== "fact" || hit.time_status === "unknown" ? 1 : 0;
const importance = (hit: Primary) => hit.resource_type === "fact" ? hit.record.importance : 0;
const recency = (hit: Primary) => hit.resource_type === "memo" ? hit.record.eventDate ?? "" : hit.record.updatedAt;

export async function readMemoryContext(
  readPage: MemoryPageReader, input: MemoryContextInput,
  { signal, timeoutMs = 2000, today = dateInEvaOrbit() }: { signal?: AbortSignal; timeoutMs?: number; today?: string } = {},
): Promise<MemoryContext> {
  const { query, time, supplied, ids, limit, maxChars } = readInput(input, today);
  const factsOnly = input.primary_resource === "fact";
  const terms = { terms: query.terms, supplied };
  const packet: Packet = { version: 1, time, current_facts: [], historical_facts: [], unknown_facts: [], memos: [], entities: [], sources: [] };
  const reasons = new Set<Reason>();
  const notices: Notice[] = [];
  const timeout = AbortSignal.timeout(timeoutMs);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const deadline = performance.now() + timeoutMs;
  const outOfTime = () => {
    if (!abort.aborted && performance.now() < deadline) return false;
    reasons.add("timeout");
    return true;
  };

  async function collect<K extends MemoryResource>(resource: K, filters: MemoryPageInput<K>) {
    const items: MemoryPageItem<K>[] = [];
    let cursor: string | undefined;
    try {
      do {
        abort.throwIfAborted();
        if (performance.now() >= deadline) throw new DOMException("Memory Context timed out", "TimeoutError");
        const page = await new Promise<MemoryPage<MemoryPageItem<K>>>((resolve, reject) => {
          const stop = () => reject(abort.reason);
          abort.addEventListener("abort", stop, { once: true });
          void Promise.resolve().then(() => readPage(resource, {
            ...filters, limit: 100, cursor, order: "created", signal: abort,
          } as MemoryPageInput<K>)).then(resolve, reject).finally(() => abort.removeEventListener("abort", stop));
        });
        items.push(...page.items);
        if (performance.now() >= deadline) throw new DOMException("Memory Context timed out", "TimeoutError");
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      return { items, complete: true };
    } catch (error) {
      reasons.add(abort.aborted || (error instanceof Error && error.name === "TimeoutError") ? "timeout" : "query_failed");
      return { items, complete: false };
    }
  }

  const [entities, facts, memos] = await Promise.all([
    collect("entity", { relatedTerms: query.terms }),
    collect("fact", {
      relatedTerms: query.terms, includeSourceMatches: true,
      ...(ids.length ? { relatedEntityIds: ids } : {}),
      ...(time.mode === "current" ? { status: "active" as const } : {}),
      ...(time.mode !== "history" ? { validOn: time.date } : {}),
    }),
    factsOnly ? null : collect("memo", { relatedTerms: query.terms, type: input.memo_type, status: input.memo_status ?? (time.mode === "history" ? undefined : "active") }),
  ]);
  const entityHits = new Map<string, EntityHit>();
  for (const entity of entities.items) {
    if (outOfTime()) break;
    const matched = entityMatches(entity, terms);
    if (matched.length) entityHits.set(entity.id, makeHit("entity", entity, matched, "not_applicable"));
  }
  if (ids.length) {
    const known = await collect("entity", { ids, includeMerged: true });
    for (const entity of known.items) {
      entityHits.set(entity.id, makeHit("entity", entity, [{ field: "entity_id", term: "", score: 110 }, ...entityMatches(entity, terms)], "not_applicable"));
    }
  }
  const candidates: Primary[] = factsOnly ? [] : [...entityHits.values()].filter(hit => !ids.length || ids.includes(hit.id));
  for (const memo of memos?.items ?? []) {
    if (outOfTime()) break;
    if (memo.status === "merged" && input.memo_status !== "merged") continue;
    const date = memo.eventDate;
    if ((time.from && (!date || date < time.from)) || (time.to && (!date || date > time.to)) ||
      (time.mode === "as_of" && (!date || date > time.date))) continue;
    const matches = [
      ...textMatches([memo.title], "memo_title", terms, 82, 72), ...textMatches([memo.content], "memo_content", terms, 80, 68),
      ...textMatches(memo.tags, "memo_tag", terms, 76, 52), ...textMatches([memo.type, memo.status], "memo_type_or_status", terms, 36, 24),
    ];
    if (matches.length) candidates.push(makeHit("memo", memo, matches, date ? "dated" : "unknown"));
  }
  const factHits = new Map<string, FactHit>();
  for (const { sourceMatches: sourceSignals = [], ...fact } of facts.items) {
    if (outOfTime()) break;
    const linked = factEntities(fact);
    if (ids.length && !linked.some(id => ids.includes(id))) continue;
    const status = factTime(fact, time);
    if (!status) continue;
    const fields = factFields(fact.objectValue);
    const matches: Match[] = [
      ...textMatches([fact.predicate], "predicate", terms, 74, 63),
      ...textMatches(fields.text, "object_value", terms, 73, 63),
      ...query.terms.filter(term => /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d{1,3})?$/i.test(term) && fields.numbers.includes(Number(term)))
        .map(term => ({ field: "object_value", term, score: 73 })),
      ...sourceSignals.map(({ field, term }) => ({
        field, term, score: (field === "source_excerpt" ? 58 : field === "source_record_id" ? 43 : 41) + (supplied.has(term) ? 2 : 0),
      })),
    ];
    for (const [field, id] of [["subject", fact.subjectEntityId], ["object_entity", fact.objectEntityId], ["perspective", fact.perspectiveEntityId]] as const) {
      const entity = id && entityHits.get(id);
      if (entity) matches.push(...entityMatches(entity.record, terms).map(match => ({ ...match, field: field + "_" + match.field })));
    }
    if (matches.length) factHits.set(fact.id, { ...makeHit("fact", fact, matches, status, linked), sources_complete: false });
  }
  if (time.mode === "history" && factHits.size && !reasons.has("timeout")) {
    const seeds = [...factHits.values()].sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id)).slice(0, limit);
    const parents = unique(seeds.map(hit => hit.record.supersedesFactId).filter((id): id is string => id !== null));
    const relatives = await Promise.all([
      parents.length ? collect("fact", { ids: parents }) : null,
      collect("fact", { supersedesIds: seeds.map(hit => hit.id) }),
    ]);
    for (const fact of relatives.flatMap(page => page?.items ?? [])) {
      if (factHits.has(fact.id)) continue;
      const status = factTime(fact, time);
      const linked = factEntities(fact);
      if (!status || (ids.length && !linked.some(id => ids.includes(id)))) continue;
      const anchor = seeds.find(hit => hit.record.supersedesFactId === fact.id || hit.id === fact.supersedesFactId);
      if (anchor) factHits.set(fact.id, {
        ...makeHit("fact", fact, [{ field: "version_link", term: "", score: Math.max(1, anchor.relevance - 10) }], status, linked),
        sources_complete: false,
      });
    }
  }
  candidates.push(...factHits.values());
  candidates.sort((a, b) => b.relevance - a.relevance || priority(b) - priority(a) ||
    importance(b) - importance(a) || recency(b).localeCompare(recency(a)) || String(a.id).localeCompare(String(b.id)) ||
    a.resource_type.localeCompare(b.resource_type));
  if (candidates.length > limit) reasons.add("result_limit");

  // Resolve names for the bounded Fact shortlist before budgeting, then hydrate evidence only for included Facts.
  const shortlist = candidates.slice(0, limit);
  shortlist.forEach((hit, rank) => { hit.rank = rank; });
  const unresolved = unique(shortlist.filter((hit): hit is FactHit => hit.resource_type === "fact")
    .flatMap(hit => hit.entity_ids)).filter(id => !entityHits.has(id));
  if (unresolved.length) {
    const related = await collect("entity", { ids: unresolved, includeMerged: true });
    for (const entity of related.items) entityHits.set(entity.id, makeHit("entity", entity, entityMatches(entity, terms), "not_applicable"));
  }
  let returned = 0;
  const includedEntities = new Set<string>();
  const includedFacts = new Map<string, FactHit>();
  let chars = JSON.stringify(packet).length;
  const appendSize = (item: unknown, groupLength: number) => JSON.stringify(item).length + (groupLength ? 1 : 0);
  for (const hit of shortlist) {
    if (outOfTime()) break;
    if (hit.resource_type === "entity" && includedEntities.has(hit.id)) { returned++; continue; }
    const linked = hit.entity_ids.filter(id => !includedEntities.has(id)).map(id => entityHits.get(id)).filter((item): item is EntityHit => item !== undefined);
    const group: Primary[] = hit.resource_type === "entity" ? packet.entities : hit.resource_type === "memo" ? packet.memos :
      current(hit.time_status) ? packet.current_facts : hit.time_status === "unknown" ? packet.unknown_facts : packet.historical_facts;
    const added = appendSize(hit, group.length) + linked.reduce((size, entity, index) =>
      size + appendSize(entity, packet.entities.length + index), 0);
    if (chars + added > maxChars) {
      reasons.add("character_budget");
      continue;
    }
    chars += added;
    packet.entities.push(...linked);
    group.push(hit);
    for (const entity of linked) includedEntities.add(entity.id);
    if (hit.resource_type === "entity") includedEntities.add(hit.id);
    if (hit.resource_type === "fact") {
      includedFacts.set(hit.id, hit);
      if (hit.entity_ids.some(id => !includedEntities.has(id))) reasons.add("missing_entity");
      if (hit.record.validFrom === null && hit.record.validTo === null) notices.push({ code: "validity_unknown", ids: [hit.id] });
      if (hit.time_status === "corrected") notices.push({ code: "corrected_history", ids: [hit.id] });
    }
    if (hit.resource_type === "memo" && hit.time_status === "unknown") notices.push({ code: "event_date_unknown", ids: [hit.id] });
    returned++;
  }

  if (includedFacts.size) {
    const sources = await collect("source", { factIds: [...includedFacts.keys()] });
    const incomplete = new Set<string>();
    const sourceHits: SourceHit[] = [];
    for (const source of sources.items) {
      if (outOfTime()) break;
      sourceHits.push(makeHit("source", source, sourceMatches(source, terms), "not_applicable"));
    }
    sourceHits.sort((a, b) => b.relevance - a.relevance || includedFacts.get(a.record.factId)!.rank - includedFacts.get(b.record.factId)!.rank ||
      b.record.createdAt.localeCompare(a.record.createdAt) || a.id.localeCompare(b.id));
    for (const source of sourceHits) {
      if (outOfTime()) break;
      const fact = includedFacts.get(source.record.factId)!;
      source.entity_ids = fact.entity_ids;
      const added = appendSize(source, packet.sources.length) + appendSize(source.id, fact.source_ids.length);
      if (chars + added > maxChars) {
        incomplete.add(fact.id);
        reasons.add("character_budget");
        continue;
      }
      chars += added;
      packet.sources.push(source);
      fact.source_ids.push(source.id);
    }
    for (const fact of includedFacts.values()) {
      fact.sources_complete = sources.complete && !reasons.has("timeout") && !incomplete.has(fact.id);
      if (!fact.sources_complete) reasons.add("source_incomplete");
      else if (!fact.source_ids.length) notices.push({ code: "missing_source", ids: [fact.id] });
    }
  }

  const assertions = new Map<string, FactHit[]>();
  for (const hit of packet.current_facts) {
    const fact = hit.record;
    const key = JSON.stringify([fact.subjectEntityId, fact.predicate, fact.perspectiveEntityId]);
    const values = assertions.get(key) ?? [];
    values.push(hit);
    assertions.set(key, values);
  }
  for (const hits of assertions.values()) {
    const first = hits[0].record;
    if (hits.some(({ record }) => record.objectEntityId !== first.objectEntityId || !isDeepStrictEqual(record.objectValue, first.objectValue))) notices.push({ code: "different_assertions", ids: hits.map(hit => hit.id) });
  }
  if (reasons.size) notices.push({ code: "incomplete" });
  return {
    ...packet, query, notices,
    coverage: {
      status: reasons.has("timeout") ? "timeout" : reasons.has("query_failed") ? "failed" : reasons.size ? "partial" : "complete",
      complete: reasons.size === 0,
      truncated: ["result_limit", "character_budget", "source_incomplete"].some(reason => reasons.has(reason as Reason)),
      reasons: [...reasons], matched_count: candidates.length, returned_count: returned,
    },
    context_text: returned ? JSON.stringify(packet) : "",
  };
}
