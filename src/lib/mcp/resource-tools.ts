import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ResourceRegistry } from "./resource-registry";

type ToolRunner = (action: () => Promise<Record<string, unknown>>) => Promise<CallToolResult>;

const resource = z.string().trim().min(1).max(100).describe("Resource name from eo_resources. This is intentionally a plain string, not an enum.");
const resourceId = z.union([z.number().int().positive(), z.string().trim().min(1).max(200)]);
const data = z.record(z.string(), z.json());

export function registerGenericResourceTools(server: McpServer, run: ToolRunner, resourceRegistry: ResourceRegistry) {
  server.registerTool("eo_resources", {
    description: "Discover EvaOrbit resources and capabilities. EvaOrbit stores long-term personal context as well as business records. In ordinary conversation, when existing personal facts, people/relationships, historical events, long-term preferences, past decisions or project context could affect the answer, proactively retrieve relevant Memo, Memory Graph and business records before guessing or asking the user to repeat saved context. Start here to choose resources, then eo_schema for usage and search contracts. Retrieval does not authorize memory writes; do not automatically persist casual remarks or assistant guesses.",
    inputSchema: z.object({}).strict(),
  }, async () => run(async () => ({ resources: resourceRegistry.resources() })));

  server.registerTool("eo_schema", {
    description: "Describe a resource's usage_guidance, search_schema, operation_semantics, fields, create_fields/update_fields, field variants, action_schemas and validation rules. Consult before querying or mutating unfamiliar resources; choose Memo for broad personal context, Memory Graph for entity-linked assertions, and business resources for current domain state.",
    inputSchema: z.object({ resource }).strict(),
  }, async ({ resource: name }) => run(async () => ({ schema: resourceRegistry.schema(name) })));

  server.registerTool("eo_search", {
    description: "Retrieve existing EvaOrbit personal context or business records. Search Memo for narrative background/preferences/decisions; resolve Memory Entities by name/aliases before querying their Facts and sources; combine relevant business resources for current state. Search before creating duplicate identities, references or records. Follow eo_schema.search_schema for keyword scope, filters, default lifecycle/validity and pagination. Empty or truncated results do not prove absence; try aliases or narrower filters. Search does not authorize automatically saving new memories.",
    inputSchema: z.object({
      resource,
      query: z.string().max(500).optional(),
      filters: data.optional(),
      limit: z.number().int().min(1).max(100).default(20),
      cursor: z.string().max(500).optional(),
    }).strict(),
  }, async ({ resource: name, query, filters, limit, cursor }) => run(async () => ({ resource: name, ...await resourceRegistry.search(name, { query, filters, limit, cursor }) })));

  server.registerTool("eo_get", {
    description: "Retrieve one known EvaOrbit record by its real ID, often after search. Use details to recover context, verify provenance/associations and inspect existing values before mutation. Memory Entity get includes related Facts; Memory Fact get includes sources. Consult eo_schema for composite, UUID, date or singleton IDs.",
    inputSchema: z.object({ resource, id: resourceId }).strict(),
  }, async ({ resource: name, id }) => run(async () => ({ resource: name, item: await resourceRegistry.get(name, id) })));

  server.registerTool("eo_create", {
    description: "Create through a registered business resource after reading eo_schema and checking existing records. Resolve related IDs through search/get; do not guess associations or unknown data. Durable memory writes require the user's explicit request to retain/update/correct meaningful context, not casual mention or model inference. Check operation_semantics: Food Library create is an upsert that can replace existing values with create defaults.",
    inputSchema: z.object({ resource, data }).strict(),
  }, async ({ resource: name, data: input }) => run(async () => ({ resource: name, item: await resourceRegistry.create(name, input) })));

  server.registerTool("eo_update", {
    description: "Update an existing EvaOrbit record using eo_schema.update_fields and operation_semantics. Most resources preserve omitted top-level fields; supplied arrays/objects may replace contents. relation_event currently requires complete event input rather than PATCH. Read the existing record first when preserving associations or nested data. Unknown fields are rejected; never send derived/readonly or migration-only fields as ordinary updates.",
    inputSchema: z.object({ resource, id: resourceId, data }).strict(),
  }, async ({ resource: name, id, data: input }) => run(async () => ({ resource: name, item: await resourceRegistry.update(name, id, input) })));

  server.registerTool("eo_delete", {
    description: "Invoke a resource's business removal operation after reading eo_schema.operation_semantics. Removal may permanently delete, archive referenced records, cancel reminders or affect derived balances/history; it is not universally a hard delete. Cat Routine delete permanently removes the routine/owned reminder, while its archive action retains history. Verify source ownership and reported limitations before calling; no table names are accepted.",
    inputSchema: z.object({ resource, id: resourceId }).strict(),
  }, async ({ resource: name, id }) => run(async () => ({ resource: name, ...await resourceRegistry.delete(name, id) })));

  server.registerTool("eo_action", {
    description: "Run a registered business action after reading eo_schema.action_schemas and operation_semantics for prerequisites, required/conditional data, ID meaning and side effects. Actions may create care records or payments, advance schedules, complete Tasks or merge graph identities; do not substitute field edits for them. Only advertised actions exist; Memory Fact candidate review/superseding is not exposed by current generic tools.",
    inputSchema: z.object({ resource, action: z.string().trim().min(1).max(100), id: resourceId.optional(), data: data.optional() }).strict(),
  }, async ({ resource: name, action, id, data: input }) => run(async () => ({ resource: name, action, result: await resourceRegistry.action(name, { action, id, data: input ?? {} }) })));
}
