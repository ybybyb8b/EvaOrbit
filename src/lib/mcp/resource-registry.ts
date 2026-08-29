import { ConflictError } from "../errors.ts";
import type { ChronicleEntry } from "../types.ts";
import { parseChronicleEntryPatch, parseNewChronicleEntry, ValidationError } from "../validation.ts";

export type ResourceId = string | number;
export type ResourceCapability = "search" | "get" | "create" | "update" | "delete" | "action";
export type ResourceRecord = Record<string, unknown>;

export type ResourceField = {
  type: "integer" | "string";
  description: string;
  format?: string;
  enum?: string[];
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

function numericId(value: ResourceId) {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Chronicle id must be a positive integer.");
  return id;
}

function assertOnlyKeys(data: ResourceRecord, allowed: readonly string[], operation: string) {
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ValidationError(`${operation} does not accept: ${unknown.join(", ")}. Call eo_schema first.`);
}

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

export function createResourceRegistry(chronicle: ChronicleResourceOperations) {
  return new ResourceRegistry([chronicleResource(chronicle)]);
}
