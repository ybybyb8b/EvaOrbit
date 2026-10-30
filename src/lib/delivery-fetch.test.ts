import assert from "node:assert/strict";
import test from "node:test";
import { createDeliveryFetch } from "./push/delivery-fetch.ts";

const base = "https://database.example.test";
const futureJwt = () => Response.json({ code: "PGRST303", message: "JWT issued at future" }, { status: 401 });

test("delivery table reads recover after bounded JWT retries without replaying other work", async () => {
  const waits: number[] = [];
  let calls = 0;
  const request = createDeliveryFetch(base, async (_input, init) => {
    assert.equal(init?.headers, headers);
    return ++calls < 3 ? futureJwt() : Response.json([{ id: 1 }]);
  }, async ms => { waits.push(ms); });
  const headers = { apikey: "test" };
  const response = await request(`${base}/rest/v1/reminders?select=id`, { headers });
  assert.deepEqual(await response.json(), [{ id: 1 }]);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [500, 1500]);
});

test("exhausted JWT retries preserve the original response and error body", async () => {
  let calls = 0;
  const request = createDeliveryFetch(base, async () => { calls += 1; return futureJwt(); }, async () => {});
  const response = await request(`${base}/rest/v1/medication_presets`);
  assert.equal(calls, 3);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "PGRST303", message: "JWT issued at future" });
});

test("mutations, RPCs, external requests and unrelated errors are never retried", async () => {
  for (const [url, method, response] of [
    [`${base}/rest/v1/reminders`, "POST", futureJwt()],
    [`${base}/rest/v1/reminders`, "PATCH", futureJwt()],
    [`${base}/rest/v1/reminders`, "DELETE", futureJwt()],
    [`${base}/rest/v1/rpc/operation`, "GET", futureJwt()],
    ["https://api.day.app/push", "GET", futureJwt()],
    [`${base}/auth/v1/user`, "GET", futureJwt()],
    [`${base}/rest/v1/reminders`, "GET", Response.json({ code: "42501", message: "permission denied" }, { status: 403 })],
    [`${base}/rest/v1/reminders`, "GET", Response.json({ code: "PGRST303", message: "JWT expired" }, { status: 401 })],
    [`${base}/rest/v1/reminders`, "GET", Response.json({ code: "OTHER", message: "JWT issued at future" }, { status: 401 })],
    [`${base}/rest/v1/reminders`, "GET", new Response("invalid JSON", { status: 401 })],
  ] as const) {
    let calls = 0;
    const request = createDeliveryFetch(base, async () => { calls += 1; return response; }, async () => assert.fail("unexpected retry"));
    assert.equal(await request(url, { method }), response);
    assert.equal(calls, 1);
    assert.ok((await response.text()).length > 0);
  }
});

test("network failures are not retried by the JWT wrapper", async () => {
  let calls = 0;
  const error = new Error("network failure");
  const request = createDeliveryFetch(base, async () => { calls += 1; throw error; });
  await assert.rejects(request(`${base}/rest/v1/reminders`), e => e === error);
  assert.equal(calls, 1);
});

test("abort during backoff stops the read before another attempt", async () => {
  const controller = new AbortController();
  let calls = 0;
  const request = createDeliveryFetch(base, async () => {
    calls += 1;
    controller.abort();
    return futureJwt();
  });
  await assert.rejects(request(new Request(`${base}/rest/v1/reminders`, { signal: controller.signal })), { name: "AbortError" });
  assert.equal(calls, 1);
});
