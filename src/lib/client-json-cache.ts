type CacheEntry = {
  data?: unknown;
  expiresAt: number;
  promise?: Promise<unknown>;
};

const entries = new Map<string, CacheEntry>();

function refresh<T>(url: string, ttl: number, entry: CacheEntry) {
  if (entry.promise) return entry.promise as Promise<T>;
  entry.promise = fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load ${url}`);
    const data = await response.json() as T;
    entry.data = data;
    entry.expiresAt = Date.now() + ttl;
    return data;
  }).finally(() => { entry.promise = undefined; });
  entries.set(url, entry);
  return entry.promise as Promise<T>;
}

export function loadCachedJson<T>(url: string, ttl = 5 * 60_000): Promise<T> {
  const entry = entries.get(url) ?? { expiresAt: 0 };
  if (entry.data !== undefined) {
    if (entry.expiresAt <= Date.now()) void refresh<T>(url, ttl, entry).catch(() => undefined);
    return Promise.resolve(entry.data as T);
  }
  return refresh<T>(url, ttl, entry).catch((error) => {
    if (entry.data === undefined) entries.delete(url);
    throw error;
  });
}

export function prefetchCachedJson(url: string, ttl = 5 * 60_000) {
  return loadCachedJson(url, ttl).then(() => undefined);
}

export function invalidateCachedJson(url: string) {
  entries.delete(url);
}

export function clearClientJsonCache() {
  entries.clear();
}
