import "server-only";

import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { ConflictError } from "../errors";
import { withMcpRepository } from "../repositories";
import { ValidationError } from "../validation";
import { resourceRegistry } from "./resource-registry.server";
import { registerGenericResourceTools } from "./resource-tools";

function success(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function safeError(error: unknown) {
  if (error instanceof ValidationError || error instanceof ConflictError) return error.message;
  return "EvaOrbit could not complete this request.";
}

async function runTool(action: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try { return success(await withMcpRepository(action)); }
  catch (error) { return failure(safeError(error)); }
}

function createServer() {
  const server = new McpServer({ name: "eva-orbit", version: "0.1.0" }, { capabilities: { tools: {} } });
  registerGenericResourceTools(server, runTool, resourceRegistry);
  return server;
}

export const mcpHandler = createMcpHandler(createServer, { responseMode: "json", legacy: "stateless" });
