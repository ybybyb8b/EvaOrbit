declare global { interface Window { __evaorbitPendingPath?: unknown } }

// Native validates the scheme/origin; validate again before entering the local router.
export function takeNativeNavigationPath(host: Pick<Window, "__evaorbitPendingPath">): string | null {
  const path = host.__evaorbitPendingPath;
  delete host.__evaorbitPendingPath;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f]/.test(path)) return null;
  const rawPath = path.split(/[?#]/, 1)[0];
  let decoded: string;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (/[\\\u0000-\u001f]/.test(decoded) || decoded.startsWith("//") || decoded.split("/").some(part => part === "." || part === "..")) return null;
  const routes = ["/tasks", "/settings/notifications", "/food", "/health", "/lucius", "/memo"];
  return decoded === "/" || decoded === "/ai" || routes.some(route => decoded === route || decoded.startsWith(route + "/")) ? path : null;
}
