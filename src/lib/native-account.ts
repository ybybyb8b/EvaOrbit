import "server-only";

import { allowedEmail, usesSupabase } from "./config";
import { HttpError } from "./errors";
import { createSupabaseServerClient } from "./supabase/server";

export type NativeAccount = { id: string; email: string };

export async function currentNativeAccount(): Promise<NativeAccount | null> {
  if (!usesSupabase()) return null;
  const expectedEmail = allowedEmail();
  if (!expectedEmail) throw new HttpError("服务器登录配置不可用", 503);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const id = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  if (error || !id || email !== expectedEmail) return null;
  return { id, email };
}
