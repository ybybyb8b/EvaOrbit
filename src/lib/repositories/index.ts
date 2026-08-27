import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { usesSupabase } from "../config";
import type { EvaOrbitRepository } from "./types";

const repositoryContext = new AsyncLocalStorage<EvaOrbitRepository>();
let mcpRepository: Promise<EvaOrbitRepository> | null = null;

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
  if (!mcpRepository) {
    console.info("[mcp-diagnostic]", { stage: "mcp_repository_init_start" });
    const backend = usesSupabase() ? "supabase" : "sqlite";
    console.info("[mcp-diagnostic]", { stage: "backend_resolved", backend });
    mcpRepository = (backend === "supabase"
      ? import("./supabase").then(({ createMcpSupabaseRepository }) => createMcpSupabaseRepository())
      : import("./sqlite").then(({ sqliteRepository }) => sqliteRepository))
      .then((repository) => {
        console.info("[mcp-diagnostic]", { stage: "repository_init_success" });
        return repository;
      });
  }
  return repositoryContext.run(await mcpRepository, action);
}
