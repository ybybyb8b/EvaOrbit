import { ConflictError } from "../errors.ts";
import type { ChronicleEntry, LuciusCase, LuciusCaseErrorType, LuciusCaseSeverity, LuciusCaseStatus, LuciusDiaryEntry, Memo, MemoStatus, MemoType } from "../types.ts";
import { dateOnly, parseChronicleEntryPatch, parseLuciusCasePatch, parseLuciusDiaryPatch, parseMemoPatch, parseNewChronicleEntry, parseNewLuciusCase, parseNewLuciusDiaryEntry, parseNewMemo, ValidationError } from "../validation.ts";

export type ResourceId = string | number;
export type ResourceCapability = "search" | "get" | "create" | "update" | "delete" | "action";
export type ResourceRecord = Record<string, unknown>;

export type ResourceField = {
  type: "integer" | "string" | "boolean" | "array";
  description: string;
  format?: string;
  enum?: string[];
  items?: { type: "string" };
  max_length?: number;
  read_only?: boolean;
  default?: unknown;
};

export type ResourceSchema = {
  resource: string;
  description: string;
  fields: Record<string, ResourceField>;
  required_fields: string[];
  writable_fields: string[];
  searchable_fields: string[];
  supported_actions: string[];
  validation_rules: string[];
};

type ResourceSearchInput = { query?: string; filters?: ResourceRecord; limit: number; cursor?: string };
type ResourceActionInput = { id?: ResourceId; action: string; data: ResourceRecord };

type RegisteredResource = {
  schema: ResourceSchema;
  search?: (input: ResourceSearchInput) => Promise<{ items: ResourceRecord[]; next_cursor: string | null }>;
  get?: (id: ResourceId) => Promise<ResourceRecord>;
  create?: (data: ResourceRecord) => Promise<ResourceRecord>;
  update?: (id: ResourceId, data: ResourceRecord) => Promise<ResourceRecord>;
  delete?: (id: ResourceId) => Promise<{ deleted: true; id: ResourceId }>;
  action?: (input: ResourceActionInput) => Promise<ResourceRecord>;
};

export type ChronicleResourceOperations = {
  search(input: { query?: string; limit?: number }): Promise<ChronicleEntry[]>;
  get(id: number): Promise<ChronicleEntry | null>;
  create(input: Pick<ChronicleEntry, "date" | "title" | "contentMd" | "source">): Promise<ChronicleEntry>;
  update(id: number, input: Partial<Pick<ChronicleEntry, "date" | "title" | "contentMd" | "source">>): Promise<ChronicleEntry | null>;
  delete(id: number): Promise<boolean>;
};

export type MemoResourceOperations = {
  search(input: { query?: string; tag?: string; type?: MemoType; status?: MemoStatus; limit?: number }): Promise<Memo[]>;
  get(id: number): Promise<Memo | null>;
  create(input: Omit<Memo, "id" | "createdAt" | "updatedAt">): Promise<Memo>;
  update(id: number, input: Partial<Omit<Memo, "id" | "createdAt" | "updatedAt">>): Promise<Memo | null>;
  delete(id: number): Promise<boolean>;
};

export type LuciusDiaryResourceOperations = {
  search(input: { query?: string; tag?: string; limit?: number }): Promise<LuciusDiaryEntry[]>;
  get(id: number): Promise<LuciusDiaryEntry | null>;
  create(input: Omit<LuciusDiaryEntry, "id" | "createdAt" | "updatedAt">): Promise<LuciusDiaryEntry>;
  update(id: number, input: Partial<Omit<LuciusDiaryEntry, "id" | "createdAt" | "updatedAt">>): Promise<LuciusDiaryEntry | null>;
  delete(id: number): Promise<boolean>;
};

export type LuciusCaseResourceOperations = {
  search(input: { query?: string; errorType?: LuciusCaseErrorType; severity?: LuciusCaseSeverity; status?: LuciusCaseStatus; currentOnly?: boolean; limit?: number }): Promise<LuciusCase[]>;
  get(id: number): Promise<LuciusCase | null>;
  create(input: Omit<LuciusCase, "id" | "createdAt" | "updatedAt">): Promise<LuciusCase>;
  update(id: number, input: Partial<Omit<LuciusCase, "id" | "createdAt" | "updatedAt">>): Promise<LuciusCase | null>;
  delete(id: number): Promise<boolean>;
  recordRecurrence(id: number, occurredDate?: string): Promise<LuciusCase | null>;
};

export type ResourceRegistryOperations = {
  memo: MemoResourceOperations;
  chronicle: ChronicleResourceOperations;
  luciusDiary: LuciusDiaryResourceOperations;
  luciusCase: LuciusCaseResourceOperations;
};

function numericId(value: ResourceId, resource = "Resource") {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`${resource} id must be a positive integer.`);
  return id;
}

function assertOnlyKeys(data: ResourceRecord, allowed: readonly string[], operation: string) {
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ValidationError(`${operation} does not accept: ${unknown.join(", ")}. Call eo_schema first.`);
}

function definedValues<T extends ResourceRecord>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function mappedInput(data: ResourceRecord, fields: Record<string, string>) {
  return Object.fromEntries(Object.entries(fields).filter(([source]) => Object.hasOwn(data, source)).map(([source, target]) => [target, data[source]]));
}

function rejectCursor(cursor: string | undefined, resource: string) {
  if (cursor) throw new ValidationError(`${resource} does not support cursor pagination yet.`);
}

function filterEnum<T extends string>(value: unknown, values: readonly T[], field: string): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) throw new ValidationError(`${field} filter is invalid.`);
  return value as T;
}

function filterText(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 60) throw new ValidationError(`${field} filter is invalid.`);
  return value.trim();
}

function migrationFields(): Record<string, ResourceField> {
  return {
    source_system: { type: "string", max_length: 120, description: "Optional source system reserved for migrations." },
    source_id: { type: "string", max_length: 300, description: "Optional identifier in the source system." },
    source_url: { type: "string", format: "uri", max_length: 2000, description: "Optional HTTP or HTTPS source URL." },
    imported_at: { type: "string", format: "date-time", description: "Optional import timestamp." },
  };
}

const migrationWritableFields = ["source_system", "source_id", "source_url", "imported_at"];
const migrationInputMap = { source_system: "sourceSystem", source_id: "sourceId", source_url: "sourceUrl", imported_at: "importedAt" };

function chronicleRecord(entry: ChronicleEntry): ResourceRecord {
  return {
    id: entry.id,
    date: entry.date,
    title: entry.title,
    content_md: entry.contentMd,
    source: entry.source,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function migrationRecord(item: Memo | LuciusDiaryEntry | LuciusCase) {
  return { source_system: item.sourceSystem, source_id: item.sourceId, source_url: item.sourceUrl, imported_at: item.importedAt };
}

function memoRecord(item: Memo): ResourceRecord {
  return { id: item.id, title: item.title, content: item.content, type: item.type, status: item.status, tags: item.tags, event_date: item.eventDate, confirmed_at: item.confirmedAt, merged_into_id: item.mergedIntoId, ...migrationRecord(item), created_at: item.createdAt, updated_at: item.updatedAt };
}

function luciusDiaryRecord(item: LuciusDiaryEntry): ResourceRecord {
  return { id: item.id, date: item.date, content: item.content, tags: item.tags, ...migrationRecord(item), created_at: item.createdAt, updated_at: item.updatedAt };
}

function luciusCaseRecord(item: LuciusCase): ResourceRecord {
  return { id: item.id, title: item.title, error_type: item.errorType, severity: item.severity, status: item.status, trigger_scenes: item.triggerScenes, error_quote: item.errorQuote, cause: item.cause, correct_behavior: item.correctBehavior, mandatory_rule: item.mandatoryRule, next_check: item.nextCheck, punishment: item.punishment, first_occurred_date: item.firstOccurredDate, latest_occurred_date: item.latestOccurredDate, occurrence_count: item.occurrenceCount, consecutive_correct_count: item.consecutiveCorrectCount, recurrence_interval_days: item.recurrenceIntervalDays, is_recurrence: item.isRecurrence, reset_threshold: item.resetThreshold, ...migrationRecord(item), created_at: item.createdAt, updated_at: item.updatedAt };
}

function chronicleResource(operations: ChronicleResourceOperations): RegisteredResource {
  const writableFields = ["date", "title", "content_md", "source"];
  const schema: ResourceSchema = {
    resource: "chronicle",
    description: "Dated Markdown entries in EvaOrbit Chronicle. Multiple entries may share the same date.",
    fields: {
      id: { type: "integer", description: "Stable Chronicle entry identifier.", read_only: true },
      date: { type: "string", format: "date", description: "Entry date in YYYY-MM-DD format." },
      title: { type: "string", max_length: 300, description: "Entry title; surrounding whitespace is trimmed." },
      content_md: { type: "string", max_length: 100000, description: "Original Markdown body. Markdown is stored without rewriting." },
      source: { type: "string", enum: ["manual", "chatgpt"], default: "manual", description: "How the entry text originated." },
      created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
      updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
    },
    required_fields: ["date", "title", "content_md"],
    writable_fields: writableFields,
    searchable_fields: ["title", "content_md"],
    supported_actions: [],
    validation_rules: [
      "date must be a real calendar date in YYYY-MM-DD format",
      "title must contain 1-300 characters after trimming",
      "content_md must contain non-whitespace Markdown and be at most 100000 characters",
      "source must be manual or chatgpt and defaults to manual",
      "update is PATCH: omitted fields remain unchanged",
      "unknown fields are rejected",
    ],
  };

  return {
    schema,
    async search({ query, filters = {}, limit, cursor }) {
      assertOnlyKeys(filters, [], "chronicle search filters");
      if (cursor) throw new ValidationError("Chronicle does not support cursor pagination yet.");
      return { items: (await operations.search({ query, limit })).map(chronicleRecord), next_cursor: null };
    },
    async get(resourceId) {
      const entry = await operations.get(numericId(resourceId));
      if (!entry) throw new ConflictError("Chronicle entry not found.");
      return chronicleRecord(entry);
    },
    async create(data) {
      assertOnlyKeys(data, writableFields, "chronicle create");
      const parsed = parseNewChronicleEntry({ date: data.date, title: data.title, contentMd: data.content_md, source: data.source });
      return chronicleRecord(await operations.create(parsed));
    },
    async update(resourceId, data) {
      assertOnlyKeys(data, writableFields, "chronicle update");
      const mapped: Record<string, unknown> = {};
      if (Object.hasOwn(data, "date")) mapped.date = data.date;
      if (Object.hasOwn(data, "title")) mapped.title = data.title;
      if (Object.hasOwn(data, "content_md")) mapped.contentMd = data.content_md;
      if (Object.hasOwn(data, "source")) mapped.source = data.source;
      const validated = parseChronicleEntryPatch(mapped);
      const patch = Object.fromEntries(Object.entries(validated).filter(([, value]) => value !== undefined));
      const entry = await operations.update(numericId(resourceId), patch);
      if (!entry) throw new ConflictError("Chronicle entry not found.");
      return chronicleRecord(entry);
    },
    async delete(resourceId) {
      const id = numericId(resourceId);
      if (!await operations.delete(id)) throw new ConflictError("Chronicle entry not found.");
      return { deleted: true, id };
    },
  };
}

function memoResource(operations: MemoResourceOperations): RegisteredResource {
  const writableFields = ["title", "content", "type", "status", "tags", "event_date", "confirmed_at", "merged_into_id", ...migrationWritableFields];
  const inputMap = { title: "title", content: "content", type: "type", status: "status", tags: "tags", event_date: "eventDate", confirmed_at: "confirmedAt", merged_into_id: "mergedIntoId", ...migrationInputMap };
  return {
    schema: {
      resource: "memo",
      description: "Long-term facts, rules, people, events, and context used by EvaOrbit. Search defaults to current active Memo only.",
      fields: {
        id: { type: "integer", description: "Stable Memo identifier.", read_only: true },
        title: { type: "string", max_length: 300, description: "Memo title." },
        content: { type: "string", max_length: 100000, description: "Long-term fact, rule, event, or note content." },
        type: { type: "string", enum: ["basic", "supplement", "event", "note"], default: "note", description: "Memo classification: 基本信息、补充信息、事件内容或便签内容." },
        status: { type: "string", enum: ["active", "merged", "archived", "historical"], default: "active", description: "Lifecycle state: 当前有效、已合并、已归档或历史记录." },
        tags: { type: "array", items: { type: "string" }, description: "Up to 20 unique tags." },
        event_date: { type: "string", format: "date", description: "Optional related event date." },
        confirmed_at: { type: "string", format: "date-time", description: "Optional confirmation timestamp." },
        merged_into_id: { type: "integer", description: "Optional target Memo identifier when merged." },
        ...migrationFields(),
        created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
        updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["title", "content"],
      writable_fields: writableFields,
      searchable_fields: ["title", "content"],
      supported_actions: [],
      validation_rules: [
        "search without filters.status returns only status=active Memo",
        "set filters.status explicitly to active, merged, archived, or historical to search that lifecycle state",
        "search filters accept only status, type, and tag",
        "update is PATCH: omitted fields remain unchanged",
        "archive by PATCHing status to archived; eo_delete uses the Memo business service",
        "unknown fields are rejected",
      ],
    },
    async search({ query, filters = {}, limit, cursor }) {
      assertOnlyKeys(filters, ["status", "type", "tag"], "memo search filters"); rejectCursor(cursor, "Memo");
      const status = filterEnum(filters.status, ["active", "merged", "archived", "historical"] as const, "status") ?? "active";
      const type = filterEnum(filters.type, ["basic", "supplement", "event", "note"] as const, "type");
      const tag = filterText(filters.tag, "tag");
      return { items: (await operations.search({ query, status, type, tag, limit })).map(memoRecord), next_cursor: null };
    },
    async get(resourceId) { const item = await operations.get(numericId(resourceId, "Memo")); if (!item) throw new ConflictError("Memo not found."); return memoRecord(item); },
    async create(data) { assertOnlyKeys(data, writableFields, "memo create"); return memoRecord(await operations.create(parseNewMemo(mappedInput(data, inputMap)))); },
    async update(resourceId, data) { assertOnlyKeys(data, writableFields, "memo update"); const item = await operations.update(numericId(resourceId, "Memo"), definedValues(parseMemoPatch(mappedInput(data, inputMap)))); if (!item) throw new ConflictError("Memo not found."); return memoRecord(item); },
    async delete(resourceId) { const id = numericId(resourceId, "Memo"); if (!await operations.delete(id)) throw new ConflictError("Memo not found."); return { deleted: true, id }; },
  };
}

function luciusDiaryResource(operations: LuciusDiaryResourceOperations): RegisteredResource {
  const writableFields = ["date", "content", "tags", ...migrationWritableFields];
  const inputMap = { date: "date", content: "content", tags: "tags", ...migrationInputMap };
  return {
    schema: {
      resource: "lucius_diary",
      description: "Lucius subjective diary entries, stored as a lightweight date-descending timeline.",
      fields: {
        id: { type: "integer", description: "Stable Diary entry identifier.", read_only: true },
        date: { type: "string", format: "date", description: "Diary date in YYYY-MM-DD format." },
        content: { type: "string", max_length: 100000, description: "Subjective Diary content." },
        tags: { type: "array", items: { type: "string" }, description: "Free-form tags; common values include 日常、连接、信任、修正、误解、情绪、成长." },
        ...migrationFields(),
        created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true },
        updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["date", "content"], writable_fields: writableFields, searchable_fields: ["content"], supported_actions: [],
      validation_rules: ["date must be a real calendar date in YYYY-MM-DD format", "search filters accept only tag", "update is PATCH: omitted fields remain unchanged", "unknown fields are rejected"],
    },
    async search({ query, filters = {}, limit, cursor }) { assertOnlyKeys(filters, ["tag"], "lucius_diary search filters"); rejectCursor(cursor, "Lucius Diary"); return { items: (await operations.search({ query, tag: filterText(filters.tag, "tag"), limit })).map(luciusDiaryRecord), next_cursor: null }; },
    async get(resourceId) { const item = await operations.get(numericId(resourceId, "Lucius Diary")); if (!item) throw new ConflictError("Lucius Diary entry not found."); return luciusDiaryRecord(item); },
    async create(data) { assertOnlyKeys(data, writableFields, "lucius_diary create"); return luciusDiaryRecord(await operations.create(parseNewLuciusDiaryEntry(mappedInput(data, inputMap)))); },
    async update(resourceId, data) { assertOnlyKeys(data, writableFields, "lucius_diary update"); const item = await operations.update(numericId(resourceId, "Lucius Diary"), definedValues(parseLuciusDiaryPatch(mappedInput(data, inputMap)))); if (!item) throw new ConflictError("Lucius Diary entry not found."); return luciusDiaryRecord(item); },
    async delete(resourceId) { const id = numericId(resourceId, "Lucius Diary"); if (!await operations.delete(id)) throw new ConflictError("Lucius Diary entry not found."); return { deleted: true, id }; },
  };
}

function luciusCaseResource(operations: LuciusCaseResourceOperations): RegisteredResource {
  const writableFields = ["title", "error_type", "severity", "status", "trigger_scenes", "error_quote", "cause", "correct_behavior", "mandatory_rule", "next_check", "punishment", "first_occurred_date", "latest_occurred_date", "occurrence_count", "consecutive_correct_count", "recurrence_interval_days", "is_recurrence", "reset_threshold", ...migrationWritableFields];
  const inputMap = { title: "title", error_type: "errorType", severity: "severity", status: "status", trigger_scenes: "triggerScenes", error_quote: "errorQuote", cause: "cause", correct_behavior: "correctBehavior", mandatory_rule: "mandatoryRule", next_check: "nextCheck", punishment: "punishment", first_occurred_date: "firstOccurredDate", latest_occurred_date: "latestOccurredDate", occurrence_count: "occurrenceCount", consecutive_correct_count: "consecutiveCorrectCount", recurrence_interval_days: "recurrenceIntervalDays", is_recurrence: "isRecurrence", reset_threshold: "resetThreshold", ...migrationInputMap };
  return {
    schema: {
      resource: "lucius_case",
      description: "Lucius correction and recurrence case records. Use record_recurrence instead of calculating recurrence counters client-side.",
      fields: {
        id: { type: "integer", description: "Stable case identifier.", read_only: true }, title: { type: "string", max_length: 300, description: "Case name." },
        error_type: { type: "string", enum: ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"], description: "Error classification." },
        severity: { type: "string", enum: ["minor", "moderate", "serious", "habitual"], default: "moderate", description: "Case severity." },
        status: { type: "string", enum: ["serving", "probation", "temporary_release", "permanent_record"], default: "serving", description: "Case status." },
        trigger_scenes: { type: "array", items: { type: "string" }, description: "Scenes that trigger this error." }, error_quote: { type: "string", max_length: 10000, description: "Original erroneous wording." },
        cause: { type: "string", max_length: 20000, description: "Root cause." }, correct_behavior: { type: "string", max_length: 20000, description: "Expected correct behavior." }, mandatory_rule: { type: "string", max_length: 20000, description: "Mandatory rule." },
        next_check: { type: "string", format: "date", description: "Optional next review date." }, punishment: { type: "string", max_length: 10000, description: "Optional consequence or corrective task." },
        first_occurred_date: { type: "string", format: "date", description: "First occurrence date." }, latest_occurred_date: { type: "string", format: "date", description: "Latest occurrence date." },
        occurrence_count: { type: "integer", default: 1, description: "Total occurrences." }, consecutive_correct_count: { type: "integer", default: 0, description: "Consecutive correct interactions." }, recurrence_interval_days: { type: "integer", description: "Days between the two latest occurrences; null for same-day recurrence." }, is_recurrence: { type: "boolean", default: false, description: "Whether recurrence has been recorded." }, reset_threshold: { type: "integer", default: 3, description: "Correct streak threshold." },
        ...migrationFields(), created_at: { type: "string", format: "date-time", description: "Server-assigned creation timestamp.", read_only: true }, updated_at: { type: "string", format: "date-time", description: "Server-assigned update timestamp.", read_only: true },
      },
      required_fields: ["title", "error_type", "cause", "correct_behavior", "mandatory_rule", "first_occurred_date"], writable_fields: writableFields,
      searchable_fields: ["title", "cause", "mandatory_rule"], supported_actions: ["record_recurrence"],
      validation_rules: ["search filters accept error_type, severity, status, and current_only", "latest_occurred_date cannot be earlier than first_occurred_date", "record_recurrence accepts optional data.occurred_date and atomically updates recurrence state", "do not send occurrence_count or other derived recurrence values to record_recurrence", "update is PATCH: omitted fields remain unchanged", "unknown fields are rejected"],
    },
    async search({ query, filters = {}, limit, cursor }) { assertOnlyKeys(filters, ["error_type", "severity", "status", "current_only"], "lucius_case search filters"); rejectCursor(cursor, "Lucius Case"); if (filters.current_only !== undefined && typeof filters.current_only !== "boolean") throw new ValidationError("current_only filter is invalid."); return { items: (await operations.search({ query, errorType: filterEnum(filters.error_type, ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"] as const, "error_type"), severity: filterEnum(filters.severity, ["minor", "moderate", "serious", "habitual"] as const, "severity"), status: filterEnum(filters.status, ["serving", "probation", "temporary_release", "permanent_record"] as const, "status"), currentOnly: filters.current_only as boolean | undefined, limit })).map(luciusCaseRecord), next_cursor: null }; },
    async get(resourceId) { const item = await operations.get(numericId(resourceId, "Lucius Case")); if (!item) throw new ConflictError("Lucius Case not found."); return luciusCaseRecord(item); },
    async create(data) { assertOnlyKeys(data, writableFields, "lucius_case create"); return luciusCaseRecord(await operations.create(parseNewLuciusCase(mappedInput(data, inputMap)))); },
    async update(resourceId, data) { assertOnlyKeys(data, writableFields, "lucius_case update"); const item = await operations.update(numericId(resourceId, "Lucius Case"), definedValues(parseLuciusCasePatch(mappedInput(data, inputMap)))); if (!item) throw new ConflictError("Lucius Case not found."); return luciusCaseRecord(item); },
    async delete(resourceId) { const id = numericId(resourceId, "Lucius Case"); if (!await operations.delete(id)) throw new ConflictError("Lucius Case not found."); return { deleted: true, id }; },
    async action({ id, action, data }) { if (action !== "record_recurrence") throw new ValidationError(`lucius_case does not support action: ${action}.`); if (id === undefined) throw new ValidationError("record_recurrence requires a case id."); assertOnlyKeys(data, ["occurred_date"], "lucius_case record_recurrence"); const occurredDate = data.occurred_date === undefined ? undefined : dateOnly(data.occurred_date, "复发日期"); const item = await operations.recordRecurrence(numericId(id, "Lucius Case"), occurredDate); if (!item) throw new ConflictError("Lucius Case not found."); return luciusCaseRecord(item); },
  };
}

export class ResourceRegistry {
  readonly #resources: Map<string, RegisteredResource>;

  constructor(resources: RegisteredResource[]) {
    this.#resources = new Map(resources.map((resource) => [resource.schema.resource, resource]));
  }

  #resource(name: string) {
    const resource = this.#resources.get(name);
    if (!resource) throw new ValidationError(`Unknown resource: ${name}. Call eo_resources for available resources.`);
    return resource;
  }

  resources() {
    return [...this.#resources.values()].map((resource) => ({
      resource: resource.schema.resource,
      description: resource.schema.description,
      capabilities: (["search", "get", "create", "update", "delete", "action"] as const).filter((capability) => Boolean(resource[capability])),
      actions: resource.schema.supported_actions,
    }));
  }

  schema(resource: string) {
    return this.#resource(resource).schema;
  }

  async search(resource: string, input: ResourceSearchInput) {
    const handler = this.#resource(resource).search;
    if (!handler) throw new ValidationError(`${resource} does not support search.`);
    return handler(input);
  }

  async get(resource: string, id: ResourceId) {
    const handler = this.#resource(resource).get;
    if (!handler) throw new ValidationError(`${resource} does not support get.`);
    return handler(id);
  }

  async create(resource: string, data: ResourceRecord) {
    const handler = this.#resource(resource).create;
    if (!handler) throw new ValidationError(`${resource} does not support create.`);
    return handler(data);
  }

  async update(resource: string, id: ResourceId, data: ResourceRecord) {
    const handler = this.#resource(resource).update;
    if (!handler) throw new ValidationError(`${resource} does not support update.`);
    return handler(id, data);
  }

  async delete(resource: string, id: ResourceId) {
    const handler = this.#resource(resource).delete;
    if (!handler) throw new ValidationError(`${resource} does not support delete.`);
    return handler(id);
  }

  async action(resource: string, input: ResourceActionInput) {
    const registered = this.#resource(resource);
    if (!registered.action || !registered.schema.supported_actions.includes(input.action)) throw new ValidationError(`${resource} does not support action: ${input.action}.`);
    return registered.action(input);
  }
}

export function createResourceRegistry(operations: ResourceRegistryOperations) {
  return new ResourceRegistry([
    memoResource(operations.memo),
    chronicleResource(operations.chronicle),
    luciusDiaryResource(operations.luciusDiary),
    luciusCaseResource(operations.luciusCase),
  ]);
}
