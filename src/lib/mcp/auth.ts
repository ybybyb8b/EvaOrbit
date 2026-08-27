import "server-only";

import { timingSafeEqual } from "node:crypto";

export function mcpTokenConfigured() {
  return Boolean(process.env.EVAORBIT_MCP_TOKEN?.trim());
}

export function hasValidMcpBearer(request: Request) {
  const expected = process.env.EVAORBIT_MCP_TOKEN?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!expected || !match) return false;
  const suppliedBuffer = Buffer.from(match[1], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function mcpUnauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
  });
}
