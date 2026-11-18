import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig, usesSupabase } from "../config";
import { ConflictError } from "../errors";
import type { McpOAuthIdentity } from "../mcp-oauth";
import { buildAgentPermissions, canonicalResource, type AgentCall } from "./agent-policy";
import { resourceRegistry } from "./resource-registry.server";
import { McpAuthConfigurationError } from "./auth";

export const agentPermissions = buildAgentPermissions(resourceRegistry.resources());
export type AgentConnection = {
  client_id: string;
  name: string;
  state: "pending" | "active" | "paused" | "revoked";
  policy: unknown;
  created_at: string;
  authorized_at: string | null;
  expires_at: string | null;
  revision: number;
};

export function createAgentDataClient(identity: McpOAuthIdentity) {
  const { url, publishableKey } = supabaseConfig();
  const secret = process.env.EVAORBIT_AGENT_BRIDGE_KEY;
  if (!usesSupabase() || !secret || !/^[0-9a-f]{64}$/.test(secret)) throw new McpAuthConfigurationError();
  const restOrigin = new URL(url).origin;
  return createClient(url, publishableKey, {
    accessToken: async () => identity.accessToken,
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const endpoint = new URL(request.url);
      if (endpoint.origin !== restOrigin || !endpoint.pathname.startsWith("/rest/v1/")) {
        throw new Error("EvaOrbit Agent bridge accepts Data API requests only");
      }
      const headers = new Headers(request.headers);
      headers.set("x-evaorbit-agent-bridge", secret);
      return fetch(request, { headers, redirect: "error", cache: "no-store" });
    } },
  });
}

const agentRequest = new AsyncLocalStorage<{ identity: McpOAuthIdentity; client: SupabaseClient }>();
export function withAgentRequest<T>(identity: McpOAuthIdentity, fn: () => T) {
  return agentRequest.run({ identity, client: createAgentDataClient(identity) }, fn);
}
export function getAgentRequest() {
  const request = agentRequest.getStore();
  if (!request) throw new Error("Agent request is unavailable");
  return request;
}

export async function loadAgentConnection(client: SupabaseClient): Promise<AgentConnection> {
  const { data, error } = await client.rpc("evaorbit_agent_session");
  if (error || !data?.client_id) throw new Error("Agent connection could not be loaded");
  return data as AgentConnection;
}

export async function auditAgentCall(client: SupabaseClient, input: {
  resource: string; operation: string; target: string | null; result: string; auditId?: number;
}): Promise<number> {
  const { data, error } = await client.rpc("evaorbit_agent_audit", {
    p_resource: input.resource, p_operation: input.operation, p_target: input.target,
    p_result: input.result, p_id: input.auditId,
  });
  if (error || !Number.isSafeInteger(data)) throw new Error("Agent audit could not be recorded");
  return data;
}

export function agentWriteReceipt(client: SupabaseClient, call: AgentCall) {
  if (!call.requestId) return;
  const fingerprint = createHash("sha256").update(JSON.stringify(
    [canonicalResource(call.resource), call.operation, call.action ?? null, call.id == null ? null : String(call.id), call.data ?? {}],
    (_key, value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0))
      : value,
  )).digest("hex");
  return async (result?: "allowed" | "failed", target?: string | null) => {
    const { data, error } = await client.rpc("evaorbit_agent_write_receipt", {
      p_request_id: call.requestId, p_fingerprint: fingerprint, p_result: result, p_target: target,
    });
    if (error?.code === "23505") throw new ConflictError("This request_id was already used with different input.");
    if (error || !data) throw new Error("Agent write receipt unavailable");
    return data as { claimed: boolean; result: "unknown" | "allowed" | "failed"; target: string | null };
  };
}
