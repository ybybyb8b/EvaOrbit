import assert from "node:assert/strict";
import test from "node:test";
import { captureEventKitPreferences, parseEventKitPreferences, resolveEventKitPreferences } from "./eventkit-preferences.ts";
import { loadEventKitAccountPreferences, saveEventKitAccountPreferences, eventKitSourcesKey, eventKitRoutesKey } from "./eventkit-auto-sync.ts";
import type { EventKitSource, EventKitStatus } from "./eventkit-sync.ts";
const source = (identifier: string, title = "Tasks"): EventKitSource => ({ identifier, title, sourceIdentifier: "cloud", sourceTitle: "iCloud", allowsContentModifications: true });
const status = (reminderLists: EventKitSource[], calendars: EventKitSource[] = []): EventKitStatus => ({ available: true, installationId: "new-install", calendarPermission: "full_access", reminderPermission: "full_access", reminderLists, calendars });
const old = status([source("old")], [source("calendar", "Sleep")]);
const backup = captureEventKitPreferences(old, { old: "two_way", calendar: "import" }, { tasks: "old" });
test("reinstall remaps source IDs and routes; ambiguous and read-only targets pause", () => {
  assert.deepEqual(resolveEventKitPreferences(backup, status([source("new")], [source("new-calendar", "Sleep")])), { modes: { new: "two_way", "new-calendar": "import" }, routes: { tasks: "new" }, unresolved: 0 });
  assert.equal(resolveEventKitPreferences(backup, status([source("a"), source("b")])).unresolved, 2);
  const locked = resolveEventKitPreferences(backup, status([{ ...source("new"), allowsContentModifications: false }]));
  assert.deepEqual(locked.routes, {}); assert.equal(locked.modes.new, "off");
  const collision = parseEventKitPreferences({ ...backup, sources: [...backup.sources, { ...backup.sources[1], identifier: "another-old" }] });
  assert.deepEqual(resolveEventKitPreferences(collision, status([source("new")])).routes, {});
});
test("unavailable scopes retain backup and explicit route clearing persists", () => {
  const saved = captureEventKitPreferences(status([]), {}, {}, backup);
  assert.equal(saved.sources.find(item => item.identifier === "old")?.mode, "two_way");
  assert.equal(saved.routes.tasks, "old");
  const cleared = captureEventKitPreferences(status([]), {}, { tasks: "" }, backup);
  assert.equal(cleared.routes.tasks, "");
  assert.throws(() => parseEventKitPreferences({ ...backup, routes: { tasks: "missing" } }));
  assert.throws(() => parseEventKitPreferences({ ...backup, sources: [backup.sources[0], backup.sources[0]] }));
});
test("account backup restores after localStorage loss; save failure never replaces local choices", async () => {
  const originalStorage = globalThis.localStorage, originalFetch = globalThis.fetch;
  const values = new Map<string, string>(); let writes = 0, fail = false;
  globalThis.localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } as Storage;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") { writes++; if (fail) return Response.json({ error: "offline" }, { status: 503 }); }
    return Response.json({ available: true, userId: "account", revision: 1, preferences: backup });
  };
  try {
    const installed = status([source("new")], [source("new-calendar", "Sleep")]);
    const restored = await loadEventKitAccountPreferences(installed);
    assert.equal(writes, 0); assert.equal(restored.routes.tasks, "new");
    assert.equal(JSON.parse(values.get(eventKitSourcesKey)!).new, "two_way");
    assert.equal(JSON.parse(values.get(eventKitRoutesKey)!).tasks, "new");
    fail = true;
    await assert.rejects(saveEventKitAccountPreferences(installed, { new: "off" }, {}), /offline/);
    assert.equal(JSON.parse(values.get(eventKitSourcesKey)!).new, "two_way");
    values.clear();
    assert.equal((await loadEventKitAccountPreferences(installed)).routes.tasks, "new");
  } finally { globalThis.localStorage = originalStorage; globalThis.fetch = originalFetch; }
});
