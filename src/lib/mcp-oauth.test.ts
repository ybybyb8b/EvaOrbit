import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { MCP_RESOURCE, McpOAuthError, supabaseOAuthIssuer, verifySupabaseMcpAccessToken } from "./mcp-oauth.ts";

const supabaseUrl = "https://oauth-test.supabase.co";
const issuer = supabaseOAuthIssuer(supabaseUrl);
const keyId = "oauth-test-key";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicJwk = publicKey.export({ format: "jwk" });
const jwks = {
  keys: [{ ...publicJwk, kid: keyId, alg: "ES256", key_ops: ["verify"] }],
};

function token(audience: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: issuer,
    sub: "11111111-1111-4111-8111-111111111111",
    aud: audience,
    role: "authenticated",
    scope: "openid email",
    iat: now,
    exp: now + 300,
  })).toString("base64url");
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const fetcher: typeof fetch = async () => Response.json(jwks);

test("Supabase MCP OAuth token accepts the exact MCP resource audience", async () => {
  const identity = await verifySupabaseMcpAccessToken({
    token: token(MCP_RESOURCE),
    supabaseUrl,
    publishableKey: "test-publishable-key",
    fetcher,
  });
  assert.equal(identity.userId, "11111111-1111-4111-8111-111111111111");
});

test("Supabase MCP OAuth token rejects Supabase's generic authenticated audience", async () => {
  await assert.rejects(
    verifySupabaseMcpAccessToken({
      token: token("authenticated"),
      supabaseUrl,
      publishableKey: "test-publishable-key",
      fetcher,
    }),
    McpOAuthError,
  );
});
