import { hasValidMcpBearer, mcpTokenConfigured, mcpUnauthorized } from "@/lib/mcp/auth";
import { mcpHandler } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!mcpTokenConfigured()) return new Response(JSON.stringify({ error: "MCP server is not configured." }), { status: 503, headers: { "Content-Type": "application/json" } });
  if (!hasValidMcpBearer(request)) return mcpUnauthorized();
  return mcpHandler.fetch(request);
}
