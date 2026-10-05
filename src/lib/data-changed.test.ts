import assert from "node:assert/strict";
import test from "node:test";
import { dataChangedDomains, dataChangedEvent, notifyDataChanged, subscribeDataChanged } from "./data-changed.ts";

test("Data domains are deduplicated and unrelated or malformed notifications are ignored", () => {
  assert.deepEqual(dataChangedDomains({ domains: ["calendar", "calendar", "tasks", "unknown", 1] }), ["calendar", "tasks"]);
  for (const detail of [null, {}, { domains: "calendar" }]) assert.deepEqual(dataChangedDomains(detail), []);
  const timers = new Map<number, () => void>(); let next = 0, refreshes = 0;
  const win = Object.assign(new EventTarget(), { setTimeout: (fn: () => void) => { timers.set(++next, fn); return next; }, clearTimeout: (id: number) => timers.delete(id) });
  const stop = subscribeDataChanged(["calendar"], () => refreshes++, win as unknown as Window & typeof globalThis);
  for (const domains of [["health"], [], ["unknown"]]) win.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains } }));
  assert.equal(timers.size, 0);
  for (let count = 0; count < 3; count++) win.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains: ["calendar"] } }));
  assert.equal(timers.size, 1); [...timers.values()].forEach(fn => fn()); timers.clear(); assert.equal(refreshes, 1);
  win.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains: ["calendar"] } })); stop();
  assert.equal(timers.size, 0); win.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains: ["calendar"] } })); assert.equal(timers.size, 0);
});

for (const host of ["new", "old", "failed", "browser"]) test(`Data notification uses ${host} Host compatibility without duplicate events`, async () => {
  const previous = globalThis.window, calls: string[] = [], received: unknown[] = [];
  const win = Object.assign(new EventTarget(), host === "browser" ? {} : { EvaOrbitNative: { version: 1, call: async (method: string, params: Record<string, unknown>) => {
    calls.push(method);
    if (method === "host.getInfo") return { ok: true, result: { methods: host === "old" ? [] : ["host.notifyDataChanged"] } };
    if (host === "failed") return { ok: false, error: { code: "unavailable", message: "Unavailable" } };
    win.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: params })); return { ok: true, result: { notified: true } };
  } } });
  win.addEventListener(dataChangedEvent, event => received.push((event as CustomEvent).detail)); globalThis.window = win as unknown as Window & typeof globalThis;
  try {
    await notifyDataChanged([], "eventkit"); assert.equal(calls.length, 0);
    await notifyDataChanged(["calendar", "calendar"], "eventkit");
    assert.deepEqual(received, [{ domains: ["calendar"], source: "eventkit" }]);
    assert.equal(calls.includes("host.notifyDataChanged"), host === "new" || host === "failed");
  } finally { globalThis.window = previous; }
});
