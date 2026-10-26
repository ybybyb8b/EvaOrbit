// Do not log database details, request headers, or arbitrary object properties.
export function deliveryErrorLog(error: unknown, depth = 0): Record<string, unknown> {
  const redact = (value: string) => {
    for (const [name, secret] of Object.entries(process.env)) {
      if (/SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL|COOKIE/i.test(name) && secret && secret.length >= 8) {
        value = value.split(secret).join("[REDACTED]");
      }
    }
    return value
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL REDACTED]")
      .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:cookie|set-cookie|authorization)\s*[:=][^\r\n]*/gi, "[HEADER REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]")
      .slice(0, 4000);
  };
  if (!error || typeof error !== "object") return { message: "Non-object delivery error" };
  const source = error as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of ["name", "message", "code", "stack"] as const) {
    if (typeof source[field] === "string") result[field] = redact(source[field]);
  }
  if (source.cause && depth < 3) result.cause = deliveryErrorLog(source.cause, depth + 1);
  return result;
}
