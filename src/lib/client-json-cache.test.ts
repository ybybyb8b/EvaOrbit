import assert from "node:assert/strict";
import test from "node:test";
import { clearClientJsonCache, invalidateCachedJson, loadCachedJson } from "./client-json-cache.ts";

test("deduplicates in-flight JSON requests and invalidates cached data", async () => {
  clearClientJsonCache();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(JSON.stringify({ requests }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const [first, second] = await Promise.all([
      loadCachedJson<{ requests: number }>("/resource"),
      loadCachedJson<{ requests: number }>("/resource"),
    ]);
    assert.deepEqual(first, { requests: 1 });
    assert.deepEqual(second, { requests: 1 });
    assert.equal(requests, 1);

    invalidateCachedJson("/resource");
    assert.deepEqual(await loadCachedJson("/resource"), { requests: 2 });
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearClientJsonCache();
  }
});
