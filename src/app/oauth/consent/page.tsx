import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { approveAuthorization, denyAuthorization } from "./actions";

export const metadata: Metadata = { title: "Authorize EvaOrbit" };

type ConsentSearchParams = {
  authorization_id?: string;
  error?: string;
};

export default async function OAuthConsentPage({ searchParams }: { searchParams: Promise<ConsentSearchParams> }) {
  const params = await searchParams;
  const authorizationId = params.authorization_id?.trim() ?? "";

  if (!authorizationId) {
    return <main className="login-page"><section className="login-card">
      <span className="eyebrow">OAUTH</span>
      <h1>Authorization unavailable</h1>
      <p>This authorization request is missing or no longer valid.</p>
    </section></main>;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return <main className="login-page"><section className="login-card">
      <span className="eyebrow">OAUTH</span>
      <h1>Authorization unavailable</h1>
      <p>The request could not be verified. Return to ChatGPT and try connecting again.</p>
    </section></main>;
  }
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const scopes = data.scope.split(/\s+/).filter(Boolean);
  return <main className="login-page"><section className="login-card">
    <span className="brand-mark login-mark"><span /></span>
    <span className="eyebrow">CONNECT EVAORBIT</span>
    <h1>Allow {data.client.name || "ChatGPT"}?</h1>
    <p>This lets the app use EvaOrbit’s MCP tools as your signed-in account.</p>
    {scopes.length > 0 && <p><small>Requested access: {scopes.join(", ")}</small></p>}
    {params.error && <p className="form-error">The authorization could not be completed. Please try again.</p>}
    <div className="form-actions">
      <form action={approveAuthorization}>
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button className="button primary" type="submit">Allow</button>
      </form>
      <form action={denyAuthorization}>
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button className="button secondary" type="submit">Deny</button>
      </form>
    </div>
  </section></main>;
}
