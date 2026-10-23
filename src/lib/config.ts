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

// Opt-in server configuration. Supabase RLS continues to scope every row to auth.uid().
export function isAllowedAccountEmail(email: string) {
  const primary = allowedEmail();
  return Boolean(primary) && (email.toLowerCase() === primary || isOnlineTestEmail(email));
}
export function isOnlineTestEmail(email:string){
  const normalized=email.trim().toLowerCase();
  return Boolean(allowedEmail())&&normalized!==allowedEmail()&&(process.env.EVAORBIT_TEST_EMAILS??"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean).includes(normalized);
}

export function isLocalOnlineAccountAllowed(email:string){
  return isOnlineTestEmail(email) || Boolean(allowedEmail()) && email.trim().toLowerCase()===allowedEmail() && process.env.EVAORBIT_LOCAL_ONLINE_ENABLED==="true";
}
export function isNativeIntegrationAccountAllowed(email:string){
  return !isOnlineTestEmail(email)&&isLocalOnlineAccountAllowed(email)&&process.env.EVAORBIT_LOCAL_NATIVE_ENABLED==="true";
}
