import { createClient } from "@supabase/supabase-js";

export const MCP_RESOURCE = "https://eva-orbit.vercel.app/api/mcp";
export const MCP_RESOURCE_METADATA_URL = "https://eva-orbit.vercel.app/.well-known/oauth-protected-resource";
export const MCP_REQUIRED_SCOPE = "openid";

const CLOCK_SKEW_SECONDS = 30;
const JWKS_CACHE_MS = 5 * 60 * 1000;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Jwk = {
  kty: "RSA" | "EC" | "oct" | (string & {});
  key_ops: string[];
  alg?: string;
  kid?: string;
  [key: string]: unknown;
};

type Jwks = { keys: Jwk[] };

type CachedJwks = {
  issuer: string;
  expiresAt: number;
  value: Jwks;
};

export type McpOAuthIdentity = {
  accessToken: string;
  userId: string;
};

export class McpOAuthError extends Error {
  constructor(message = "Invalid OAuth access token") {
    super(message);
    this.name = "McpOAuthError";
  }
}

let cachedJwks: CachedJwks | null = null;

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function supabaseOAuthIssuer(supabaseUrl: string) {
  return `${normalizeUrl(supabaseUrl)}/auth/v1`;
}

function decodeJwtPart(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JWT object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new McpOAuthError();
  }
}

function parseJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new McpOAuthError();
  return { header: decodeJwtPart(parts[0]), payload: decodeJwtPart(parts[1]) };
}

function validJwks(value: unknown): value is Jwks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = (value as { keys?: unknown }).keys;
  return Array.isArray(keys) && keys.every((key) => {
    if (!key || typeof key !== "object" || Array.isArray(key)) return false;
    const candidate = key as Record<string, unknown>;
    return typeof candidate.kty === "string" && Array.isArray(candidate.key_ops);
  });
}

async function getJwks(issuer: string, fetcher: typeof fetch, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedJwks?.issuer === issuer && cachedJwks.expiresAt > now) return cachedJwks.value;
  let response: Response;
  try {
    response = await fetcher(`${issuer}/.well-known/jwks.json`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new McpOAuthError();
  }
  if (!response.ok) throw new McpOAuthError();
  const value: unknown = await response.json().catch(() => null);
  if (!validJwks(value)) throw new McpOAuthError();
  cachedJwks = { issuer, expiresAt: now + JWKS_CACHE_MS, value };
  return value;
}

function audienceIncludesResource(audience: unknown) {
  if (typeof audience === "string") return audience === MCP_RESOURCE;
  return Array.isArray(audience) && audience.some((value) => value === MCP_RESOURCE);
}

function scopeIncludesRequiredScope(scope: unknown) {
  if (typeof scope === "string") return scope.split(/\s+/).includes(MCP_REQUIRED_SCOPE);
  return Array.isArray(scope) && scope.includes(MCP_REQUIRED_SCOPE);
}

export async function verifySupabaseMcpAccessToken(input: {
  token: string;
  supabaseUrl: string;
  publishableKey: string;
  fetcher?: typeof fetch;
}): Promise<McpOAuthIdentity> {
  const { header } = parseJwt(input.token);
  const algorithm = typeof header.alg === "string" ? header.alg : "";
  const keyId = typeof header.kid === "string" ? header.kid : "";
  if (!keyId || !["RS256", "ES256"].includes(algorithm)) throw new McpOAuthError();

  const issuer = supabaseOAuthIssuer(input.supabaseUrl);
  const fetcher = input.fetcher ?? fetch;
  let jwks = await getJwks(issuer, fetcher);
  let signingKey = jwks.keys.find((key) => key.kid === keyId && (!key.alg || key.alg === algorithm));
  if (!signingKey) {
    jwks = await getJwks(issuer, fetcher, true);
    signingKey = jwks.keys.find((key) => key.kid === keyId && (!key.alg || key.alg === algorithm));
  }
  if (!signingKey) throw new McpOAuthError();

  const client = createClient(input.supabaseUrl, input.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getClaims(input.token, { jwks: { keys: [signingKey] } });
  if (error || !data?.claims) throw new McpOAuthError();

  const claims = data.claims as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  const expiration = typeof claims.exp === "number" ? claims.exp : 0;
  const notBefore = typeof claims.nbf === "number" ? claims.nbf : null;
  const userId = typeof claims.sub === "string" ? claims.sub : "";

  if (claims.iss !== issuer) throw new McpOAuthError();
  if (!expiration || expiration <= now - CLOCK_SKEW_SECONDS) throw new McpOAuthError();
  if (notBefore !== null && notBefore > now + CLOCK_SKEW_SECONDS) throw new McpOAuthError();
  if (!audienceIncludesResource(claims.aud)) throw new McpOAuthError();
  if (claims.role !== "authenticated") throw new McpOAuthError();
  if (!scopeIncludesRequiredScope(claims.scope)) throw new McpOAuthError();
  if (!USER_ID_PATTERN.test(userId)) throw new McpOAuthError();

  return { accessToken: input.token, userId };
}
