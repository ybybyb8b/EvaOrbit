import assert from "node:assert/strict";
import test from "node:test";
import { cachedClientFetch, configureClientCache, invalidateClientData } from "./client-data-cache.ts";

test("global page data cache deduplicates, isolates accounts and precisely invalidates related data", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  const origin = "https://eo.test";
  let calls = 0;
  const network: typeof fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json({ calls }); };
  const read = (url: string, init?: RequestInit) => cachedClientFetch(url, init, network, origin).then(response => response.json());
  try {
    configureClientCache("alice");
    const [a, b] = await Promise.all([read("/api/tasks?status=all"), read("/api/tasks?status=all")]);
    assert.deepEqual(a, b); assert.equal(calls, 1);
    await read("/api/projects"); assert.equal(calls, 2);
    invalidateClientData(["food"]);
    await read("/api/projects"); await read("/api/tasks?status=all"); assert.equal(calls, 2, "unrelated caches remain usable");
    invalidateClientData(["tasks"]); await read("/api/tasks?status=all"); assert.equal(calls, 3);
    configureClientCache("bob"); await read("/api/tasks?status=all"); assert.equal(calls, 4);
    await read("/api/ai/settings"); await read("/api/ai/settings"); assert.equal(calls, 6, "credentials never cached");
    await read("/api/tasks?status=all", { cache: "reload" }); assert.equal(calls, 7);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(read("/api/projects", { signal: controller.signal }), { name: "AbortError" });
    configureClientCache("alice");
    let release!: (response: Response) => void;
    const pending = cachedClientFetch("/api/food/logs", undefined, () => new Promise(resolve => { release = resolve; }), origin);
    await new Promise(resolve => setTimeout(resolve, 0)); invalidateClientData(["food"]); release(Response.json({ old: true }));
    await assert.rejects(pending, { name: "AbortError" });
    assert.deepEqual(await read("/api/food/logs"), { calls: 8 });
    configureClientCache(null); await read("/api/tasks?status=all"); assert.equal(calls, 9, "anonymous reads bypass cache");
    configureClientCache("returning-account");
    const oldSession = cachedClientFetch("/api/media", undefined, () => new Promise(resolve => { release = resolve; }), origin);
    await new Promise(resolve => setTimeout(resolve, 0));
    configureClientCache(null); configureClientCache("returning-account");
    release(Response.json({ oldSession: true }));
    await assert.rejects(oldSession, { name: "AbortError" });
  } finally {
    configureClientCache(null); Reflect.deleteProperty(globalThis, "localStorage"); Reflect.deleteProperty(globalThis, "window");
  }
});

test("expired page snapshots return before a slow refresh and publish the changed result", async () => {
  const storage = new Map<string, string>(), now = Date.now;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  const win = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  try {
    configureClientCache("stale-snapshot-account");
    await cachedClientFetch("/api/projects", undefined, async () => Response.json({ version: 1 }), "https://eo.test");
    const future = now() + 61_000; Date.now = () => future;
    let release!: (response: Response) => void;
    const slow: typeof fetch = () => new Promise(resolve => { release = resolve; });
    const cached = await cachedClientFetch("/api/projects", undefined, slow, "https://eo.test");
    assert.deepEqual(await cached.json(), { version: 1 });
    const changed = new Promise<void>(resolve => win.addEventListener("eo:client-data-changed", event => { if ((event as CustomEvent).detail?.reason === "update") resolve(); }, { once: true }));
    release(Response.json({ version: 2 })); await changed;
    const fresh = await cachedClientFetch("/api/projects", undefined, () => { throw new Error("should not refetch"); }, "https://eo.test");
    assert.deepEqual(await fresh.json(), { version: 2 });
  } finally {
    Date.now = now; configureClientCache(null); Reflect.deleteProperty(globalThis, "localStorage"); Reflect.deleteProperty(globalThis, "window");
  }
});
