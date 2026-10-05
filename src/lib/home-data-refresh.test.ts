import assert from "node:assert/strict";
import test from "node:test";
import { fetchHomeData } from "./home-data-refresh.ts";

test("Home refetches the selected date and visible months without writes or sync calls", async () => {
  const previous = globalThis.fetch, calls: string[] = [], controller = new AbortController();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://eo.test"); calls.push(url.pathname + url.search);
    assert.equal(init?.cache, "no-store"); assert.equal(init?.signal, controller.signal); assert.equal(init?.method, undefined);
    return Response.json(url.pathname === "/api/home-day" ? { date: url.searchParams.get("date"), events: [{ title: "New Calendar event" }], tasks: [{ title: "Updated Task" }] } : { month: url.searchParams.get("month"), days: {} });
  };
  try {
    const result = await fetchHomeData("2026-11-01", ["2026-10", "2026-11", "2026-11"], controller.signal);
    assert.deepEqual(calls, ["/api/home-day?date=2026-11-01", "/api/timeline?month=2026-10", "/api/timeline?month=2026-11"]);
    assert.equal(result.day.events[0].title, "New Calendar event"); assert.equal(result.summaries.length, 2);
  } finally { globalThis.fetch = previous; }
});

test("Navigation/unmount aborts Home reads and read failures are not reported as successful refreshes", async () => {
  const previous = globalThis.fetch, controller = new AbortController();
  globalThis.fetch = async (_, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  try {
    const request = fetchHomeData("2026-10-05", ["2026-10"], controller.signal); controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 });
    await assert.rejects(fetchHomeData("2026-10-05", ["2026-10"], new AbortController().signal), /Could not refresh/);
  } finally { globalThis.fetch = previous; }
});
