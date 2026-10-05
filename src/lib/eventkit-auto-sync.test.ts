import assert from "node:assert/strict";
import test from "node:test";
import { eventKitConfigChanged, eventKitSyncFinished, startEventKitAutoSync, syncConfiguredEventKit } from "./eventkit-auto-sync.ts";
import { eventKitReminderExcluded, synchronizeEventKit, type EventKitStatus } from "./eventkit-sync.ts";
import { dataChangedEvent, subscribeDataChanged } from "./data-changed.ts";

function schedulerFixture() {
  const timers = new Map<number, () => void>(); let next = 0, interval = () => {};
  const win = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
    setTimeout: (fn: () => void) => { timers.set(++next, fn); return next; },
    clearTimeout: (id: number) => { timers.delete(id); },
    setInterval: (fn: () => void, ms: number) => { assert.equal(ms, 60_000); interval = fn; return 1; },
    clearInterval: () => { interval = () => {}; },
  });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  return { win, doc, timers, tick: () => interval(), flush: async () => { const ready = [...timers.values()]; timers.clear(); ready.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); } };
}

test("global EventKit scheduler debounces triggers, pauses offline/hidden and cleans up", async () => {
  const f = schedulerFixture(); let calls = 0;
  const stop = startEventKitAutoSync(async () => { calls++; }, f.win as unknown as Window & typeof globalThis, f.doc as unknown as Document);
  await f.flush(); assert.equal(calls, 1);
  for (const event of ["evaorbit:native-ready", "evaorbit:native-active", "evaorbit:eventkit-store-changed", eventKitConfigChanged, "online"]) {
    f.win.dispatchEvent(new Event(event)); f.win.dispatchEvent(new Event(event)); await f.flush();
  }
  assert.equal(calls, 6);
  f.doc.visibilityState = "hidden"; f.tick(); await f.flush(); assert.equal(calls, 6);
  f.doc.visibilityState = "visible"; f.doc.dispatchEvent(new Event("visibilitychange")); await f.flush(); assert.equal(calls, 7);
  f.win.navigator.onLine = false; f.tick(); await f.flush(); assert.equal(calls, 7);
  f.win.navigator.onLine = true; f.tick(); await f.flush(); assert.equal(calls, 8);
  stop(); f.win.dispatchEvent(new Event(eventKitConfigChanged)); f.tick(); await f.flush(); assert.equal(calls, 8); assert.equal(f.timers.size, 0);
});

test("events during a sync get one follow-up and failures can retry", async () => {
  const f = schedulerFixture(); let calls = 0, errors = 0, release!: () => void;
  f.win.addEventListener(eventKitSyncFinished, () => errors++);
  const stop = startEventKitAutoSync(async () => { calls++; if (calls === 1) await new Promise<void>(resolve => { release = resolve; }); if (calls === 2) throw new Error("offline"); }, f.win as unknown as Window & typeof globalThis, f.doc as unknown as Document);
  await f.flush(); f.win.dispatchEvent(new Event("evaorbit:eventkit-store-changed")); await f.flush(); assert.equal(calls, 1);
  release(); await new Promise(resolve => setImmediate(resolve)); await f.flush(); assert.equal(calls, 2); assert.equal(errors, 1);
  f.win.dispatchEvent(new Event("online")); await f.flush(); assert.equal(calls, 3); stop();
});
test("Sync completion and data refetch notifications never schedule another EventKit sync", async () => {
  const f = schedulerFixture(); let calls = 0, refreshes = 0;
  const win = f.win as unknown as Window & typeof globalThis;
  const unsubscribe = subscribeDataChanged(["calendar"], () => { refreshes++; win.dispatchEvent(new Event("web-refetched")); }, win);
  const stop = startEventKitAutoSync(async () => { calls++; win.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains: ["calendar"], source: "eventkit" } })); }, win, f.doc as unknown as Document);
  await f.flush(); await f.flush(); await f.flush();
  assert.equal(calls, 1); assert.equal(refreshes, 1); assert.equal(f.timers.size, 0);
  stop(); unsubscribe();
});

test("续火花 excludes imports, exports and existing links without deleting either side", async () => {
  assert.equal(eventKitReminderExcluded({ title: "🔥 续火花" }), true);
  assert.equal(eventKitReminderExcluded(undefined, { title: "续火花" }), true);
  assert.equal(eventKitReminderExcluded({ title: "买花" }), false);
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch, writes: string[] = [];
  const status: EventKitStatus = { available: true, installationId: "test", calendarPermission: "full_access", reminderPermission: "full_access", calendars: [], reminderLists: [{ identifier: "list", title: "Tasks", sourceIdentifier: "source", sourceTitle: "iCloud", allowsContentModifications: true }] };
  const links = [1, 2].map(id => ({ id, entity_type: "task", eo_id: id, eventkit_entity_type: "reminder", calendar_item_identifier: `apple-${id}`, calendar_identifier: "list", source_identifier: "source", last_synced_snapshot: { title: "续火花" } }));
  globalThis.window = { EvaOrbitNative: { version: 1, call: async (method: string) => {
    if (method !== "eventkit.fetch") writes.push(method);
    return { ok: true, result: { items: [{ calendarItemIdentifier: "apple-1", calendarIdentifier: "list", title: "续火花" }, { calendarItemIdentifier: "private", calendarIdentifier: "list", title: "续火花" }] } };
  } } } as unknown as Window & typeof globalThis;
  globalThis.fetch = async (url, init) => {
    if (init?.method && init.method !== "GET") writes.push(String(url));
    return Response.json(String(url).startsWith("/api/eventkit/links") ? links : String(url).startsWith("/api/tasks") ? [1, 2, 3].map(id => ({ id, title: "续火花", completed: false })) : []);
  };
  try {
    await synchronizeEventKit(status, { list: "import" });
    await synchronizeEventKit(status, { list: "two_way" }, { tasks: "list" });
    assert.deepEqual(writes, []);
  } finally { globalThis.window = oldWindow; globalThis.fetch = oldFetch; }
});

test("automatic sync is inert outside Native Host", async () => { assert.equal(await syncConfiguredEventKit(), null); });

test("configured auto sync migrates legacy routes, records success, and never fetches after permission revocation", async () => {
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage, oldFetch = globalThis.fetch;
  const values = new Map([["evaorbit.eventkit.sources.v1", JSON.stringify({ list: "two_way" })]]);
  const calls: string[] = []; let permission = "full_access", finishes = 0;
  const win = Object.assign(new EventTarget(), { EvaOrbitNative: { version: 1, call: async (method: string) => {
    calls.push(method);
    const result = method === "host.getInfo" ? { methods: ["eventkit.getStatus", "eventkit.requestAccess", "eventkit.fetch", "eventkit.save", "eventkit.delete"] } : method === "eventkit.getStatus" ? { available: true, installationId: "test", calendarPermission: "denied", reminderPermission: permission, calendars: [], reminderLists: [{ identifier: "list", allowsContentModifications: true }] } : { items: [] };
    return { ok: true, result };
  } } });
  win.addEventListener(eventKitSyncFinished, () => finishes++);
  globalThis.window = win as unknown as Window & typeof globalThis;
  globalThis.localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } as Storage;
  globalThis.fetch = async () => Response.json([]);
  try {
    assert.ok(await syncConfiguredEventKit());
    assert.equal(values.get("evaorbit.eventkit.routes.v1"), JSON.stringify({ tasks: "list" }));
    assert.ok(values.get("evaorbit.eventkit.last-sync.v1")); assert.equal(finishes, 1);
    permission = "denied"; calls.length = 0;
    assert.equal(await syncConfiguredEventKit(), null);
    assert.deepEqual(calls, ["host.getInfo", "eventkit.getStatus"]);
    assert.equal(finishes, 1);
  } finally { globalThis.window = oldWindow; globalThis.localStorage = oldStorage; globalThis.fetch = oldFetch; }
});
