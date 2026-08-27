import "server-only";

import { supabaseConfig } from "../config";
import { MCP_RESOURCE_METADATA_URL, McpOAuthError, verifySupabaseMcpAccessToken } from "../mcp-oauth";

export class McpAuthConfigurationError extends Error {
  constructor() {
    super("MCP OAuth is not configured");
    this.name = "McpAuthConfigurationError";
  }
}

export async function authenticateMcpRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new McpOAuthError();
  let config: ReturnType<typeof supabaseConfig>;
  try {
    config = supabaseConfig();
  } catch {
    throw new McpAuthConfigurationError();
  }
  return verifySupabaseMcpAccessToken({
    token: match[1],
    supabaseUrl: config.url,
    publishableKey: config.publishableKey,
  });
}

export function mcpUnauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${MCP_RESOURCE_METADATA_URL}", error="invalid_token"`,
    },
  });
}
