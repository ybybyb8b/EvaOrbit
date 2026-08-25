export function usesSupabase() {
  const configured = process.env.EVAORBIT_DATA_BACKEND?.trim().toLowerCase();
  if (configured === "sqlite") return false;
  if (configured === "supabase") return true;
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error("Supabase 未配置：请设置 SUPABASE_URL 和 SUPABASE_PUBLISHABLE_KEY");
  }
  return { url, publishableKey };
}

export function allowedEmail() {
  return process.env.EVAORBIT_ALLOWED_EMAIL?.trim().toLocaleLowerCase() ?? "";
}
