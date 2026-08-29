import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ResourceRegistry } from "./resource-registry";

type ToolRunner = (action: () => Promise<Record<string, unknown>>) => Promise<CallToolResult>;

const resource = z.string().trim().min(1).max(100).describe("Resource name from eo_resources. This is intentionally a plain string, not an enum.");
const resourceId = z.union([z.number().int().positive(), z.string().trim().min(1).max(200)]);
const data = z.record(z.string(), z.json());

export function registerGenericResourceTools(server: McpServer, run: ToolRunner, resourceRegistry: ResourceRegistry) {
  server.registerTool("eo_resources", {
    description: "List the server-side EvaOrbit Resource Registry and each resource's capabilities. Start here before using generic tools.",
    inputSchema: z.object({}).strict(),
  }, async () => run(async () => ({ resources: resourceRegistry.resources() })));

  server.registerTool("eo_schema", {
    description: "Describe one registered EvaOrbit resource, including fields, writable/searchable fields, actions, and validation rules.",
    inputSchema: z.object({ resource }).strict(),
  }, async ({ resource: name }) => run(async () => ({ schema: resourceRegistry.schema(name) })));

  server.registerTool("eo_search", {
    description: "Search one registered EvaOrbit resource. The registry decides which fields and filters are supported.",
    inputSchema: z.object({
      resource,
      query: z.string().max(500).optional(),
      filters: data.optional(),
      limit: z.number().int().min(1).max(100).default(20),
      cursor: z.string().max(500).optional(),
    }).strict(),
  }, async ({ resource: name, query, filters, limit, cursor }) => run(async () => ({ resource: name, ...await resourceRegistry.search(name, { query, filters, limit, cursor }) })));

  server.registerTool("eo_get", {
    description: "Get one record by ID from a registered EvaOrbit resource.",
    inputSchema: z.object({ resource, id: resourceId }).strict(),
  }, async ({ resource: name, id }) => run(async () => ({ resource: name, item: await resourceRegistry.get(name, id) })));

  server.registerTool("eo_create", {
    description: "Create one record in a registered EvaOrbit resource after strict resource-specific server validation. Call eo_schema first.",
    inputSchema: z.object({ resource, data }).strict(),
  }, async ({ resource: name, data: input }) => run(async () => ({ resource: name, item: await resourceRegistry.create(name, input) })));

  server.registerTool("eo_update", {
    description: "PATCH one record in a registered EvaOrbit resource. Omitted data fields remain unchanged; unknown fields are rejected.",
    inputSchema: z.object({ resource, id: resourceId, data }).strict(),
  }, async ({ resource: name, id, data: input }) => run(async () => ({ resource: name, item: await resourceRegistry.update(name, id, input) })));

  server.registerTool("eo_delete", {
    description: "Safely delete one record through the registered EvaOrbit business service; this never accepts a table name.",
    inputSchema: z.object({ resource, id: resourceId }).strict(),
  }, async ({ resource: name, id }) => run(async () => ({ resource: name, ...await resourceRegistry.delete(name, id) })));

  server.registerTool("eo_action", {
    description: "Run a registered non-CRUD business action such as complete, resolve, or add_rewatch. Call eo_schema to discover supported actions.",
    inputSchema: z.object({ resource, action: z.string().trim().min(1).max(100), id: resourceId.optional(), data: data.optional() }).strict(),
  }, async ({ resource: name, action, id, data: input }) => run(async () => ({ resource: name, action, result: await resourceRegistry.action(name, { action, id, data: input ?? {} }) })));
}
