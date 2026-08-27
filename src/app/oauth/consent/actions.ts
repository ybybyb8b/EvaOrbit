"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function authorizationId(formData: FormData) {
  const value = formData.get("authorization_id");
  return typeof value === "string" ? value.trim() : "";
}

async function decide(formData: FormData, action: "approve" | "deny") {
  const id = authorizationId(formData);
  if (!id) redirect("/oauth/consent?error=invalid_request");
  const supabase = await createSupabaseServerClient();
  const result = action === "approve"
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (result.error || !result.data?.redirect_url) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=consent_failed`);
  redirect(result.data.redirect_url);
}

export async function approveAuthorization(formData: FormData) {
  return decide(formData, "approve");
}

export async function denyAuthorization(formData: FormData) {
  return decide(formData, "deny");
}
