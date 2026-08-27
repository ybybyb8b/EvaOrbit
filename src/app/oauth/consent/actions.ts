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
  if (result.error || !result.data?.redirect_url) {
    console.warn("[mcp-oauth-diagnostic]", {
      stage: `consent_${action}_failed`,
      error_name: result.error?.name ?? null,
      error_status: result.error?.status ?? null,
      error_code: result.error?.code ?? null,
    });
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=consent_failed`);
  }
  console.info("[mcp-oauth-diagnostic]", { stage: `consent_${action}_success` });
  redirect(result.data.redirect_url);
}

export async function approveAuthorization(formData: FormData) {
  return decide(formData, "approve");
}

export async function denyAuthorization(formData: FormData) {
  return decide(formData, "deny");
}
