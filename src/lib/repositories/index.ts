import "server-only";

import { usesSupabase } from "../config";
import type { EvaOrbitRepository } from "./types";

export async function getRepository(): Promise<EvaOrbitRepository> {
  if (usesSupabase()) {
    const { createSupabaseRepository } = await import("./supabase");
    return createSupabaseRepository();
  }
  const { sqliteRepository } = await import("./sqlite");
  return sqliteRepository;
}
