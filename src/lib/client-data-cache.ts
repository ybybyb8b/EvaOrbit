import { affectsData, cacheReadPolicy, dataDependencies } from "./cache-policy.ts";
import { getClientSnapshot, putClientSnapshot } from "./home-cache.ts";

export const clientDataChanged = "eo:client-data-changed";
const markerKey = "eo:data-revisions";
let scope: string | null = null;
let generation = 0;
let fallback: Record<string, string> = {};
let storageUnavailable = false;
const pending = new Map<string, Promise<Response>>();

export function clientCacheScope() { return scope; }
export function configureClientCache(nextScope: string | null) {
  if (scope === nextScope) return;
  scope = nextScope; generation++; pending.clear();
  window.dispatchEvent(new CustomEvent(clientDataChanged, { detail: { domains: ["*"], reason: "scope" } }));
}

function markers() {
  if (storageUnavailable) return fallback;
  try { const value: unknown = JSON.parse(localStorage.getItem(markerKey) ?? "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {}; } catch { storageUnavailable = true; return fallback; }
}
function revision(path: string) {
  const values = markers();
  return JSON.stringify(["client-v1", values[`${scope}:*`] ?? "0", ...dataDependencies(path).map(domain => values[`${scope}:${domain}`] ?? "0")]);
}

export function invalidateClientData(domains: string[] = ["*"]) {
  const values = markers(), token = `${Date.now()}-${Math.random()}`;
  for (const domain of domains) values[`${scope}:${domain}`] = token;
  fallback = values;
  try { localStorage.setItem(markerKey, JSON.stringify(values)); } catch { storageUnavailable = true; }
  window.dispatchEvent(new CustomEvent(clientDataChanged, { detail: { domains, reason: "invalidate" } }));
}

export function isClientDataStorageKey(key: string | null) { return key === markerKey || key === null; }

export async function cachedClientFetch(input: RequestInfo | URL, init: RequestInit | undefined, network: typeof fetch, origin: string): Promise<Response> {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input), origin), path = url.pathname + url.search;
  const headers = new Headers(init?.headers ?? request?.headers);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const policy = cacheReadPolicy(path);
  if (!scope || request || method !== "GET" || url.origin !== origin || !policy || headers.has("authorization") || init?.cache === "reload" || headers.has("range")) return network(input, init);
  const account = scope, epoch = generation, token = revision(path), key = JSON.stringify([account, path, token, epoch]);
  const signal = init?.signal;
  signal?.throwIfAborted();
  const snapshot = storageUnavailable ? undefined : await getClientSnapshot<unknown>(account, path);
  signal?.throwIfAborted();
  if (scope !== account || epoch !== generation) throw new DOMException("Account changed while loading", "AbortError");
  if (token !== revision(path)) return network(input, init);
  const valid = snapshot && snapshot.data !== undefined && snapshot.revision === token && snapshot.savedAt > Date.now() - 7 * 86400000;
  const responseFromCache = () => Response.json(snapshot!.data);
  const refresh = () => {
    let work = pending.get(key);
    if (!work) {
      // Each reader owns its cancellation; one leaving page must not abort other readers.
      const options = { ...init, signal: undefined };
      work = network(url.href, options).then(async response => {
        if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.clone().json();
          const current = () => scope === account && epoch === generation && revision(path) === token;
          if (current()) {
            await putClientSnapshot(account, path, { data, savedAt: Date.now(), revision: token }, current);
            if (current() && valid && JSON.stringify(data) !== JSON.stringify(snapshot.data)) {
              window.dispatchEvent(new CustomEvent(clientDataChanged, { detail: { domains: dataDependencies(path), reason: "update", url: path } }));
            }
          }
        }
        if (valid && [401, 403, 404].includes(response.status)) invalidateClientData(dataDependencies(path));
        return response;
      }).finally(() => { pending.delete(key); });
      pending.set(key, work);
    }
    return work.then(response => { signal?.throwIfAborted(); return response.clone(); });
  };
  if (valid) {
    if (snapshot.savedAt <= Date.now() - policy.ttl) void refresh().catch(() => undefined);
    return responseFromCache();
  }
  const result = await refresh();
  if (scope !== account || epoch !== generation || token !== revision(path)) throw new DOMException("Data changed while loading", "AbortError");
  return result;
}

export function clientChangeAffects(path: string, event: Event) {
  const detail = (event as CustomEvent<{ domains?: string[]; reason?: string }>).detail;
  return detail?.reason !== "scope" && Array.isArray(detail?.domains) && affectsData(path, detail.domains);
}
