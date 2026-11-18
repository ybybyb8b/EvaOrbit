import { createClient } from "@supabase/supabase-js";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { usesSupabase, supabaseConfig } from "../src/lib/config.ts";
import { withMcpRepositoryContext } from "../src/lib/repositories/index.ts";
import { resourceRegistry } from "../src/lib/mcp/resource-registry.server.ts";
import { registerGenericResourceTools } from "../src/lib/mcp/resource-tools.ts";

// Domain-contract tests start inside the trusted Repository boundary. OAuth,
// discovery filtering and Agent grants are tested through the separate HTTP flow.
export async function makeSupabaseFixture(accessToken, userId) {
  const { createMcpSupabaseRepository } = await import("../src/lib/repositories/supabase.ts");
  const { url, publishableKey } = supabaseConfig();
  const client = createClient(url, publishableKey, {
    accessToken: async () => accessToken,
    global: { fetch: (...args) => globalThis.fetch(...args) },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createMcpSupabaseRepository(client, userId, {});
}

export async function withFixtureRepository(identity, action) {
  const repository = usesSupabase()
    ? await makeSupabaseFixture(identity.accessToken, identity.userId)
    : (await import("../src/lib/repositories/sqlite.ts")).sqliteRepository;
  return withMcpRepositoryContext(identity.clientId, repository, action);
}

export const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({ name: "evaorbit-business-test", version: "0.1.0" }, { capabilities: { tools: {} } });
  registerGenericResourceTools(server, async (operation) => {
    try {
      const data = await operation();
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  }, resourceRegistry);
  return server;
}, { responseMode: "json", legacy: "stateless" });
