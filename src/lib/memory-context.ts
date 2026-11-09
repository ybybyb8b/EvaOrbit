import { isDeepStrictEqual } from "node:util";
import type { MemoryPage, MemoryPageInput, MemoryPageItem, MemoryPageReader, MemoryResource } from "./memory-pagination";
import { memoryUuid } from "./memory-graph-validation.ts";
import { memoryTopicMatches, memoryTopics, memoryTopicSearchTerms, type MemoryTopic } from "./memory-topic.ts";
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
type Role = "subject" | "object_entity" | "perspective";
type Mention = { start: number; end: number; ids: Set<string>; name: string };
const factRoles = (fact: MemoryFact) => ({
  subject: fact.subjectEntityId, object_entity: fact.objectEntityId, perspective: fact.perspectiveEntityId,
});
const roles = ["subject", "object_entity", "perspective"] as const;
const best = (matches: Match[]) => matches.reduce((score, match) => Math.max(score, match.score), 0);

function factIntent(query: string, entities: MemoryEntity[], ids: string[]) {
  const text = fold(query.normalize("NFKC"));
  const spans = new Map<string, Mention>();
  const word = /[a-z0-9_]/;
  for (const entity of entities) for (const label of [entity.canonicalName, ...entity.aliases]) {
    const name = fold(label.normalize("NFKC").trim());
    if (!name) continue;
    for (let start = text.indexOf(name); start !== -1; start = text.indexOf(name, start + name.length)) {
      const end = start + name.length;
      if ((word.test(name[0]) && word.test(text[start - 1] ?? "")) ||
        (word.test(name.at(-1)!) && word.test(text[end] ?? ""))) continue;
      if ([...name].length === 1 && text !== name &&
        !/(?:主体|对象|宾语|视角)\s*[是为:]\s*$/.test(text.slice(0, start))) continue;
      const key = `${start}:${end}`;
      const span = spans.get(key) ?? { start, end, ids: new Set<string>(), name };
      span.ids.add(entity.id);
      spans.set(key, span);
    }
  }
  const mentions: Mention[] = [];
  for (const span of [...spans.values()].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (mentions.length && mentions.at(-1)!.end > span.start) continue;
    const preferred = ids.filter(id => span.ids.has(id));
    mentions.push(preferred.length ? { ...span, ids: new Set(preferred) } : span);
  }
  const bindings: Partial<Record<Role, Set<string>>> = {};
  const [first, second] = mentions;
  const before = first ? text.slice(0, first.start) : "";
  const between = second ? text.slice(first.end, second.start).trim() : "";
  const after = first ? text.slice(first.end).trim() : "";
  const bare = first?.name === text ? first.ids : undefined;
  let topicText: string | undefined;

  // Recognize explicit roles and a few unambiguous Chinese forms. Name order alone is not direction.
  for (const mention of mentions) {
    const label = text.slice(0, mention.start).match(/(?:^|[、,;\s])(主体|对象|宾语|视角)\s*[是为:]\s*$/)?.[1];
    if (label) bindings[label === "主体" ? "subject" : label === "视角" ? "perspective" : "object_entity"] = mention.ids;
  }
  if (Object.keys(bindings).length) {
    topicText = text.slice(mentions.at(-1)!.end);
  } else if (first && !bare && second && mentions.length === 2) {
    if (/^(?:从|站在)?\s*$/.test(before) && /^(?:的视角(?:看|评价)?|眼中的?)$/.test(between)) {
      bindings.perspective = first.ids;
      bindings.subject = second.ids;
      topicText = text.slice(second.end);
    } else if (!before && /^被$/.test(between)) {
      bindings.subject = second.ids;
      bindings.object_entity = first.ids;
      topicText = text.slice(second.end);
    } else if (/^(?:请问\s*)?$/.test(before) && /^(?:向|给|对|喜欢|信任|支持|反对|帮助|推荐了?)$/.test(between)) {
      bindings.subject = first.ids;
      bindings.object_entity = second.ids;
      topicText = (between.match(/^(?:向|给|对)$/) ? "" : between) + text.slice(second.end);
    }
  } else if (first && !bare && mentions.length === 1) {
    const incoming = before.match(/^(?:谁|哪位|哪些人)\s*(向|给|对|喜欢|信任|支持|反对|帮助|推荐)(?:了|过)?$/)?.[1];
    if (incoming) {
      bindings.object_entity = first.ids;
      topicText = (/^(?:向|给|对)$/.test(incoming) ? "" : incoming) + after;
    } else if (/^(?:从|站在)$/.test(before) && /^的视角/.test(after)) {
      bindings.perspective = first.ids;
      topicText = after.replace(/^的视角(?:看|出发)?/, "");
    } else if (/^(?:请问\s*)?(?:关于\s*)?$/.test(before) && /^[\s\p{Script=Han}a-z0-9_]/u.test(after)) {
      bindings.subject = first.ids;
      topicText = after;
    }
  }
  const topic = topicText?.replace(/(?:的?(?:事实|关系)?记录|有哪些|是什么|怎么样|什么|如何|是否|有没有|本人|关于|相关|目前|现在|过去|最近|谁)/g, " ")
    .replace(/^[\s的]+|[\s的了呢吗？?。！!]+$/g, "").trim() ?? "";
  const names = new Set(mentions.map(mention => mention.name));
  const mentionedIds = new Set(mentions.flatMap(mention => [...mention.ids]));
  return { bindings, bare, topic, names, mentionedIds };
}

function semanticMatches(values: (string | null)[], field: string, topics: MemoryTopic[], score: number): Match[] {
  return memoryTopicMatches(values, topics).map(topic => ({ field, term: topic.term, score }));
}

function factTopicTerms(intent: ReturnType<typeof factIntent>, terms: Terms) {
  if (!intent.topic) return null;
  const query = intent.topic;
  const ignored = /^(?:喜欢|偏好|喜好|关系|项目|什么|关于|记录|本人|哪些|就是|的是|的事|现在|过去|最近)$/;
  const residual = terms.terms.filter(term => fold(query).includes(fold(term)) && !ignored.test(term) && !intent.names.has(fold(term)));
  const fragments = query.split(/\s+/).filter(term => !ignored.test(term) && !/^[喝吃看去在跟与和的]$/.test(term));
  const variants = [...terms.supplied].slice(1).filter(term => !intent.names.has(fold(term)));
  return { terms: unique([query, ...fragments, ...residual, ...variants]), supplied: new Set([query, ...variants]) };
}

function factRelevance(content: Match[], roleScore: number) {
  const channels = [best(content.filter(match => match.field === "predicate")),
    best(content.filter(match => match.field === "object_value")),
    best(content.filter(match => match.field.startsWith("source_")))].sort((a, b) => b - a);
  return roleScore + channels[0] + Math.round(channels[1] / 4 + channels[2] / 8);
}

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
  // Expand the repository query, then require actual topic evidence after role resolution.
  const searchTerms = unique([...query.terms, ...memoryTopicSearchTerms(memoryTopics(query.original))]);
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
      relatedTerms: searchTerms, includeSourceMatches: true,
      ...(ids.length ? { relatedEntityIds: ids } : {}),
      ...(time.mode === "current" ? { status: "active" as const } : {}),
      ...(time.mode !== "history" ? { validOn: time.date } : {}),
    }),
    factsOnly ? null : collect("memo", { relatedTerms: searchTerms, type: input.memo_type, status: input.memo_status ?? (time.mode === "history" ? undefined : "active") }),
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
  const intent = factIntent(query.original, [...entityHits.values()].map(hit => hit.record), ids);
  const requiredRoles = roles.filter(role => intent.bindings[role]);
  const scoped = requiredRoles.length > 0;
  const topicTerms = factTopicTerms(intent, terms);
  const topics = intent.bare ? [] : memoryTopics(scoped ? intent.topic : query.original);
  const literalTopic = new Set([scoped ? intent.topic : query.original, ...query.variants]);
  const topical = (match: Match) => literalTopic.has(match.term) || memoryTopicMatches([match.term], topics).length > 0;
  const originalTerms = new Set(query.terms);
  const knownTerms = new Set(query.terms);
  const candidates: Primary[] = factsOnly ? [] : [...entityHits.values()].filter(hit =>
    (!ids.length || ids.includes(hit.id)) && (!topics.length || ids.includes(hit.id) || intent.mentionedIds.has(hit.id)));
  const exactMemoTitles = new Set<number>();
  for (const memo of memos?.items ?? []) {
    if (outOfTime()) break;
    if (memo.status === "merged" && input.memo_status !== "merged") continue;
    const date = memo.eventDate;
    if ((time.from && (!date || date < time.from)) || (time.to && (!date || date > time.to)) ||
      (time.mode === "as_of" && (!date || date > time.date))) continue;
    const exactTitle = fold(memo.title ?? "") === fold(query.original);
    const memoTerms = scoped && !exactTitle
      ? topicTerms ?? { terms: [...intent.names], supplied: new Set<string>() } : terms;
    const lexical = [
      ...textMatches([memo.title], "memo_title", memoTerms, 82, 72), ...textMatches([memo.content], "memo_content", memoTerms, 80, 68),
      ...textMatches(memo.tags, "memo_tag", memoTerms, 76, 52), ...textMatches([memo.type, memo.status], "memo_type_or_status", memoTerms, 36, 24),
    ];
    const matches = exactTitle || !topics.length ? lexical : [
      ...lexical.filter(match => match.field !== "memo_type_or_status" && topical(match)),
      ...semanticMatches([memo.title], "memo_title", topics, 71),
      ...semanticMatches([memo.content], "memo_content", topics, 61),
      ...semanticMatches(memo.tags, "memo_tag", topics, 57),
    ];
    if (scoped && !exactTitle) {
      const prose = fold([memo.title, memo.content, ...memo.tags].join("\n"));
      if (requiredRoles.some(role => ![...intent.bindings[role]!].some(id => {
        const entity = entityHits.get(id)?.record;
        return entity && [entity.canonicalName, ...entity.aliases].some(name => intent.names.has(fold(name)) && prose.includes(fold(name)));
      }))) continue;
    }
    if (matches.length) {
      for (const match of matches) knownTerms.add(match.term);
      if (exactTitle) exactMemoTitles.add(memo.id);
      candidates.push(makeHit("memo", memo, matches, date ? "dated" : "unknown"));
    }
  }
  const factHits = new Map<string, FactHit>();
  for (const { sourceMatches: sourceSignals = [], ...fact } of facts.items) {
    if (outOfTime()) break;
    const linked = factEntities(fact);
    if (ids.length && !linked.some(id => ids.includes(id))) continue;
    const status = factTime(fact, time);
    if (!status) continue;
    const roleIds = factRoles(fact);
    if (requiredRoles.some(role => !intent.bindings[role]?.has(roleIds[role] ?? ""))) continue;
    const fields = factFields(fact.objectValue);
    const lexical = (matching: Terms): Match[] => [
      ...textMatches([fact.predicate], "predicate", matching, 74, 63),
      ...textMatches(fields.text, "object_value", matching, 73, 63),
      ...matching.terms.filter(term => /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d{1,3})?$/i.test(term) && fields.numbers.includes(Number(term)))
        .map(term => ({ field: "object_value", term, score: 73 })),
    ];
    // The repository reports substring hits for Sources. Use the original query's hits;
    // expanded aliases need whole-word validation, which is available on the Fact and Memo fields.
    const sources = sourceSignals.filter(({ term }) => originalTerms.has(term)).map(({ field, term }) => ({
        field, term, score: (field === "source_excerpt" ? 58 : field === "source_record_id" ? 43 : 41) + (supplied.has(term) ? 2 : 0),
    }));
    const perspectiveOnly = intent.mentionedIds.has(roleIds.perspective ?? "") &&
      !intent.mentionedIds.has(roleIds.subject) && !intent.mentionedIds.has(roleIds.object_entity ?? "");
    const content = [...lexical(terms), ...sources.filter(match =>
      !perspectiveOnly || ![...intent.names].some(name => name.includes(fold(match.term))))];
    const topicLexical = topicTerms
      ? [...lexical(topicTerms), ...sources.filter(match => topicTerms.terms.includes(match.term))] : content;
    const topicMatches = topics.length ? [
      ...topicLexical.filter(topical),
      ...semanticMatches([fact.predicate], "predicate", topics, 68),
      ...semanticMatches(fields.text, "object_value", topics, 61),
    ] : topicLexical;
    if ((topicTerms || topics.length) && !topicMatches.length) continue;
    const matches = scoped && !topicTerms && !topics.length ? [] : [...topicMatches];
    let subject = 0, object = 0;
    for (const field of roles) {
      const id = roleIds[field];
      const entity = id && entityHits.get(id);
      if (!entity) continue;
      const found = entityMatches(entity.record, terms);
      matches.push(...found.map(match => ({ ...match, field: field + "_" + match.field })));
      if (field === "subject") subject = best(found);
      if (field === "object_entity") object = best(found);
    }
    const anchor = intent.bare;
    const direct = anchor ? anchor.has(fact.subjectEntityId) || anchor.has(fact.objectEntityId ?? "") : subject >= 90 || object >= 90;
    // Names and importance cannot stand in for the requested topic. Perspective is attribution unless explicitly requested.
    if (!scoped && !direct && !content.length) continue;
    for (const match of topicMatches) knownTerms.add(match.term);
    const roleScore = scoped ? 85 * requiredRoles.length : Math.max(subject * 0.65, object * 0.5);
    const coveredTopics = topics.filter(topic => topicMatches.some(match => match.term === topic.term)).length;
    const relevance = factRelevance(scoped && !topicTerms ? [] : topicMatches, Math.round(roleScore)) + Math.max(0, coveredTopics - 1) * 4;
    factHits.set(fact.id, { ...makeHit("fact", fact, matches, status, linked), relevance, sources_complete: false });
  }
  query.terms = [...knownTerms];
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
  const exactMemo = (hit: Primary) => hit.resource_type === "memo" && exactMemoTitles.has(hit.id) ? 1 : 0;
  candidates.sort((a, b) => exactMemo(b) - exactMemo(a) || b.relevance - a.relevance || priority(b) - priority(a) ||
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
