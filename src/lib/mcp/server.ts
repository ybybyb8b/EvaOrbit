import "server-only";

import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { ConflictError } from "../errors";
import { withMcpRequestRepository } from "../repositories";
import { ValidationError } from "../validation";
import { agentPermissions, agentWriteReceipt, auditAgentCall, getAgentRequest, loadAgentConnection } from "./agent-access";
import { agentConnectionIsActive, agentDataScope, agentPermissionAllows, allowsAgentCall, canonicalResource, agentPolicyForConnection, CHATGPT_CLIENT, resourceNames, type AgentCall, type AgentPolicy } from "./agent-policy";
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

function safeTarget(id: unknown) {
  const text = typeof id === "number" || typeof id === "string" ? String(id) : "";
  return /^(?:\d{1,16}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?:day\/)?\d{4}-\d{2}-\d{2}|yesterday|current)$/i.test(text) ? text : null;
}

function discovery(policy: AgentPolicy, clientId: string, call?: AgentCall) {
  const permissions = agentPermissions.filter((permission) => agentPermissionAllows(policy, permission));
  const forResource = (resource: string) => permissions.filter((permission) => permission.resource === canonicalResource(resource));
  if (!call) return { resources: resourceRegistry.resources().flatMap((entry) => {
    const granted = forResource(entry.resource);
    return granted.length ? [{ ...entry, capabilities: [...new Set(granted.flatMap(({ operations }) => operations))],
      actions: granted.flatMap(({ action }) => action ? [action] : []) }] : [];
  }) };
  const schema = resourceRegistry.schema(call.resource);
  const granted = forResource(call.resource);
  const actions = granted.flatMap(({ action }) => action ? [action] : []);
  const create = granted.some(({ operations }) => operations.includes("create"));
  const update = granted.some(({ operations }) => operations.includes("update"));
  const updateFields = update ? schema.update_fields.filter((field) => {
    if (schema.resource === "project_item") return policy.projectFields.some((allowed) => allowed === field);
    return schema.resource !== "task" || !["completed", "completed_on"].includes(field);
  }) : [];
  return { schema: { ...schema, required_fields: create ? schema.required_fields : [],
    create_fields: create ? schema.create_fields : [], update_fields: updateFields,
    writable_fields: [...new Set([...(create ? schema.create_fields : []), ...updateFields])],
    supported_actions: actions, action_schemas: Object.fromEntries(Object.entries(schema.action_schemas ?? {}).filter(([name]) => actions.includes(name))),
    capabilities: [...new Set(granted.flatMap(({ operations }) => operations))],
    ...(schema.resource === "subscription" ? { operation_semantics: { search: "Stored data with no automatic payment catch-up.", get: "Stored data with no automatic payment catch-up." } } : {}),
    ...(schema.resource === "project_item" && update ? { authorization_notes: ["Only listed progress fields may be updated. Verification requires the owner in EvaOrbit."] } : {}),
    ...((create || actions.length) && clientId !== CHATGPT_CLIENT ? { request_id_required_for: [ ...(create ? ["create"] : []), ...(actions.length ? ["action"] : []) ] } : {}),
  } };
}

async function runTool(action: () => Promise<Record<string, unknown>>, call?: AgentCall): Promise<CallToolResult> {
  try {
    const { client, identity } = getAgentRequest();
    const connection = await loadAgentConnection(client);
    if (connection.client_id !== identity.clientId) return failure("Agent connection could not be verified.");
    const policy = agentPolicyForConnection(connection.policy, agentPermissions, identity.clientId);
    const resource = call ? canonicalResource(call.resource) : "access";
    const details = {
      resource: Object.hasOwn(resourceNames, resource) ? resource : "access",
      operation: call?.action
        ? agentPermissions.some((entry) => entry.resource === resource && entry.action === call.action) ? "action:" + call.action : "action"
        : call?.operation ?? "discover",
      target: safeTarget(call?.id),
    };
    if (!agentConnectionIsActive(connection) || (call && !allowsAgentCall(policy, agentPermissions, call))) {
      await auditAgentCall(client, { ...details, result: "blocked" });
      return failure("Permission denied. Review this connection in EvaOrbit AI Access.");
    }
    const idempotentCapture = resource === "inbox" && call?.operation === "create";
    if (identity.clientId !== CHATGPT_CLIENT && (call?.operation === "create" || call?.operation === "action") && !call.requestId) {
      await auditAgentCall(client, { ...details, result: "blocked" });
      return failure("This write requires a stable request_id UUID. Reuse it if the request is retried.");
    }
    const auditId = await auditAgentCall(client, { ...details, result: "started" });
    const receipt = call && !idempotentCapture ? agentWriteReceipt(client, call) : undefined;
    let result: Record<string, unknown>;
    try {
      if (receipt) {
        const existing = await receipt();
        if (!existing.claimed) {
          const allowed = existing.result === "allowed";
          await auditAgentCall(client, { ...details, auditId, target: existing.target, result: allowed ? "allowed" : "failed" });
          return allowed
            ? success({ resource, request_id: call?.requestId, replayed: true, target: existing.target })
            : failure("This write was already attempted. Check the current record before taking another action.");
        }
      }
      result = !call || call.operation === "schema"
        ? discovery(policy, identity.clientId, call)
        : await withMcpRequestRepository(identity, client, agentDataScope(policy, identity.clientId, call), action);
    } catch (error) {
      await auditAgentCall(client, { ...details, auditId, result: "failed" }).catch(() => undefined);
      return failure(safeError(error));
    }
    const item = (result.item ?? result.result) as { id?: unknown } | undefined;
    const target = details.target ?? safeTarget(item?.id);
    await receipt?.("allowed", target).catch(() => console.warn("[mcp-agent-access] write receipt completion unavailable"));
    await auditAgentCall(client, { ...details, auditId, target, result: "allowed" })
      .catch(() => console.warn("[mcp-agent-access] audit completion unavailable"));
    return success(result);
  } catch (error) {
    return failure(safeError(error));
  }
}

function createServer() {
  const server = new McpServer({ name: "eva-orbit", version: "0.1.0" }, { capabilities: { tools: {} } });
  const tools = registerGenericResourceTools(server, runTool, resourceRegistry);
  server.server.setRequestHandler("tools/list", async () => {
    const { client, identity } = getAgentRequest();
    const connection = await loadAgentConnection(client);
    const policy = agentPolicyForConnection(connection.policy, agentPermissions, identity.clientId);
    const allowed = new Set<string>(["eo_resources"]);
    if (agentConnectionIsActive(connection)) {
      for (const permission of agentPermissions) {
        if (!agentPermissionAllows(policy, permission)) continue;
        allowed.add("eo_schema");
        for (const operation of permission.operations) allowed.add("eo_" + operation);
      }
    }
    return { tools: Object.entries(tools).flatMap(([name, tool]) => {
      if (!allowed.has(name)) return [];
      return [{ name, description: tool.description, inputSchema: { ...server.toolInputSchemaJson(name), type: "object" as const } }];
    }) };
  });
  return server;
}

export const mcpHandler = createMcpHandler(createServer, { responseMode: "json", legacy: "stateless" });
