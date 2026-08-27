import { authenticateMcpRequest, McpAuthConfigurationError, mcpUnauthorized } from "@/lib/mcp/auth";
import { mcpHandler } from "@/lib/mcp/server";
import { McpOAuthError } from "@/lib/mcp-oauth";
import { withMcpRequestRepository } from "@/lib/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await authenticateMcpRequest(request);
    console.info("[mcp-oauth-diagnostic]", { stage: "token_validated" });
    return await withMcpRequestRepository(identity, () => mcpHandler.fetch(request));
  } catch (error) {
    if (error instanceof McpAuthConfigurationError) {
      return new Response(JSON.stringify({ error: "MCP server is not configured." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (error instanceof McpOAuthError) {
      console.warn("[mcp-oauth-diagnostic]", {
        stage: "token_rejected",
        reason: error.reason,
        audience: error.audience,
      });
      return mcpUnauthorized();
    }
    throw error;
  }
}
