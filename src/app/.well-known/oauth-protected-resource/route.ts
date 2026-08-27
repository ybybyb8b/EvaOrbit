import { MCP_REQUIRED_SCOPE, MCP_RESOURCE, supabaseOAuthIssuer } from "@/lib/mcp-oauth";
import { supabaseConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { url } = supabaseConfig();
  return Response.json({
    resource: MCP_RESOURCE,
    authorization_servers: [supabaseOAuthIssuer(url)],
    scopes_supported: [MCP_REQUIRED_SCOPE],
    bearer_methods_supported: ["header"],
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
