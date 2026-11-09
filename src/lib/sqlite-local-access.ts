const loopbackHost = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

export function allowsSqliteLocalRequest(headers: Headers, trustedLauncher: boolean) {
  if (!trustedLauncher) return false;
  const host = headers.get("host") ?? "";
  if (!loopbackHost.test(host) || headers.has("forwarded") || headers.get("sec-fetch-site") === "cross-site") return false;
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedHost && forwardedHost !== host) return false;
  if (forwardedFor && forwardedFor !== "127.0.0.1" && forwardedFor !== "::ffff:127.0.0.1") return false;
  const origin = headers.get("origin");
  return origin === null || origin === `http://${host}`;
}
