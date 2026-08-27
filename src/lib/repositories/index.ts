import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { usesSupabase } from "../config";
import type { McpOAuthIdentity } from "../mcp-oauth";
import type { EvaOrbitRepository } from "./types";

const repositoryContext = new AsyncLocalStorage<EvaOrbitRepository>();

export async function getRepository(): Promise<EvaOrbitRepository> {
  const contextual = repositoryContext.getStore();
  if (contextual) return contextual;
  if (usesSupabase()) {
    const { createSupabaseRepository } = await import("./supabase");
    return createSupabaseRepository();
  }
  const { sqliteRepository } = await import("./sqlite");
  return sqliteRepository;
}

export async function withMcpRepository<T>(action: () => Promise<T>): Promise<T> {
  if (!repositoryContext.getStore()) throw new Error("MCP repository is not initialized for this request");
  return action();
}

export async function withMcpRequestRepository<T>(identity: McpOAuthIdentity, action: () => Promise<T>): Promise<T> {
  const repository = usesSupabase()
    ? await import("./supabase").then(({ createMcpSupabaseRepository }) => createMcpSupabaseRepository(identity.accessToken, identity.userId))
    : await import("./sqlite").then(({ sqliteRepository }) => sqliteRepository);
  return repositoryContext.run(repository, action);
}
