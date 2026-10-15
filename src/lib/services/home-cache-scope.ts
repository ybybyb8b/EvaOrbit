import "server-only";
import { usesSupabase } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import { cache } from "react";

export const getClientCacheScope = cache(async () => {
  if (!usesSupabase()) return "sqlite-local";
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") return null;
  return `supabase:${data.claims.sub}`;
});

export async function getHomeCacheScope() {
  const scope = await getClientCacheScope();
  if (!scope) throw new Error("Home requires an authenticated account");
  return scope;
}
