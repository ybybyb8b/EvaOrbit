import "server-only";
import { usesSupabase } from "../config";
import { createSupabaseServerClient } from "../supabase/server";

export async function getHomeCacheScope() {
  if (!usesSupabase()) return "sqlite-local";
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") throw new Error("Home requires an authenticated account");
  return `supabase:${data.claims.sub}`;
}
