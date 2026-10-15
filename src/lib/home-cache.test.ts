import assert from "node:assert/strict";
import test from "node:test";
import { invalidateHomeCache, readHomeSnapshot, saveHomeSnapshot } from "./home-cache.ts";

test("Home snapshots reuse fresh data, isolate accounts, revalidate stale data and reject invalidated in-flight reads", async () => {
  const previousFetch = globalThis.fetch, previousNow = Date.now;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  let now = previousNow(), requests = 0;
  Date.now = () => now;
  const signal = new AbortController().signal, cached: unknown[] = [];
  globalThis.fetch = async () => { requests++; return Response.json({ value: requests }); };
  try {
    await saveHomeSnapshot("alice", "/day", { value: 0 });
    assert.deepEqual(await readHomeSnapshot("alice", "/day", signal, data => cached.push(data)), { value: 0 });
    assert.equal(requests, 0);
    assert.deepEqual(await readHomeSnapshot("bob", "/day", signal, () => assert.fail("cross-account cache")), { value: 1 });
    now += 61000;
    assert.deepEqual(await readHomeSnapshot("alice", "/day", signal, data => cached.push(data)), { value: 2 });
    assert.deepEqual(cached, [{ value: 0 }, { value: 0 }]);
    now += 61000;
    globalThis.fetch = async () => { throw new TypeError("offline"); };
    assert.deepEqual(await readHomeSnapshot("alice", "/day", signal, () => {}), { value: 2 });
    invalidateHomeCache();
    await assert.rejects(readHomeSnapshot("alice", "/day", signal, () => assert.fail("invalid cache")), /offline/);
    let release!: (value: Response) => void;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const pending = readHomeSnapshot("alice", "/race", signal, () => {});
    await new Promise(resolve => setTimeout(resolve, 0));
    invalidateHomeCache(); release(Response.json({ value: "old" }));
    await assert.rejects(pending, { name: "AbortError" });
    globalThis.fetch = async () => Response.json({ value: "new" });
    assert.deepEqual(await readHomeSnapshot("alice", "/race", signal, () => assert.fail("race cached old data")), { value: "new" });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(readHomeSnapshot("alice", "/day", controller.signal, () => assert.fail()), { name: "AbortError" });
  } finally {
    globalThis.fetch = previousFetch; Date.now = previousNow;
    Reflect.deleteProperty(globalThis, "localStorage"); Reflect.deleteProperty(globalThis, "window");
  }
});
