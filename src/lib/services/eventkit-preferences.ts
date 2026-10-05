import "server-only";
import { allowedEmail, usesSupabase } from "../config";
import { ConflictError, HttpError } from "../errors";
import { createSupabaseServerClient } from "../supabase/server";
import { parseEventKitPreferences, type EventKitPreferences } from "../eventkit-preferences";

async function account() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.email?.toLowerCase() !== allowedEmail()) throw new HttpError("请先登录 EvaOrbit", 401);
  return { client, userId: data.user.id };
}
export async function getEventKitPreferences() {
  if (!usesSupabase()) return { available: false as const };
  const { client, userId } = await account();
  const { data, error } = await client.from("eventkit_preferences").select("preferences,revision").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("读取账户同步偏好失败");
  return { available: true as const, userId, revision: Number(data?.revision ?? 0), preferences: data ? parseEventKitPreferences(data.preferences) : null };
}
export async function saveEventKitPreferences(preferences: EventKitPreferences, revision: number) {
  if (!usesSupabase()) return { available: false as const };
  const { client, userId } = await account();
  const { data, error } = await client.rpc("save_eventkit_preferences", { p_preferences: preferences, p_revision: revision });
  if (error?.message.includes("revision conflict")) throw new ConflictError("同步偏好已在其他页面更新，请刷新后重试");
  if (error) throw new Error("保存账户同步偏好失败");
  return { available: true as const, userId, revision: Number(data.revision), preferences: parseEventKitPreferences(data.preferences) };
}
