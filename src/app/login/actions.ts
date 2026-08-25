"use server";

import { redirect } from "next/navigation";
import { allowedEmail, usesSupabase } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeDestination(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function login(formData: FormData) {
  if (!usesSupabase()) redirect("/");
  const email = String(formData.get("email") ?? "").trim().toLocaleLowerCase();
  const password = String(formData.get("password") ?? "");
  const destination = safeDestination(formData.get("next"));
  const expected = allowedEmail();
  if (!expected) redirect("/login?error=config");
  if (!email || !password || email !== expected) redirect("/login?error=invalid");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=invalid");
  redirect(destination);
}

export async function logout() {
  if (usesSupabase()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
