import assert from "node:assert/strict";
import test from "node:test";
import { eventKitCanonicalSnapshot, eventKitRecoveryURL, eventKitSnapshotHash, eventKitSyncDiagnosticText, mergeEventKitSnapshots, synchronizeEventKit, type EventKitStatus, type EventKitModes } from "./eventkit-sync.ts";
import { dataChangedEvent, type DataChangedDetail } from "./data-changed.ts";

type Item = Record<string, unknown>;
const calendarBase = { title: "Visit", notes: "", startAt: "2026-10-06T02:00:00.000Z", endAt: "2026-10-06T03:00:00.000Z", isAllDay: false, timezone: "Asia/Shanghai", location: "", status: "confirmed" };
const taskBase = { title: "Pay", notes: "", dueDate: "2026-10-06", dueTime: null, completed: false, completionDate: null };
const source = (identifier: string) => ({ identifier, title: identifier, sourceIdentifier: "source", sourceTitle: "iCloud", allowsContentModifications: true });
const status: EventKitStatus = { available: true, installationId: "00000000-0000-4000-8000-000000000001", calendarPermission: "full_access", reminderPermission: "full_access", calendars: [source("calendar")], reminderLists: [source("list")] };

function fixture() {
  const events = new Map<number, Item>(), tasks = new Map<number, Item>(), links = new Map<number, Item>(), apple = new Map<string, Item>();
  const logical = new Map<string, Item>();
  const calls: Array<{ method: string; target: string; body: Item }> = [], batchMissing = new Set<string>(), listMissing = new Set<number>();
  let nextEvent = 10000, nextApple = 0;
  const f = {
    events, tasks, links, apple, calls, batchMissing, listMissing, logical,
    lookupAvailable: true, lookupResult: "", failImport: "", failEORead: false, failBinding: false, includeEOFlags: true, failBindingCode: "",
    reinstall() { for (const [id, link] of links) { const token = `00000000-0000-4000-8000-${String(id).padStart(12,"0")}`; logical.set(`${link.entity_type}:${link.eo_id}`, { recovery_token: token, initial_snapshot: link.last_synced_snapshot }); links.set(id, { ...link, logical_link_id: token, recovery_token: token, binding_state: "recovery", bindings: [{ ...link }] }); } },
    linkEvent(id: number) {
      events.set(id, { id, ...calendarBase });
      apple.set(`event-${id}`, { ...calendarBase, calendarItemIdentifier: `event-${id}`, externalIdentifier: `external-${id}`, calendarIdentifier: "calendar", sourceIdentifier: "source" });
      links.set(id, { id, entity_type: "calendar_event", eo_id: id, eventkit_entity_type: "event", calendar_item_identifier: `event-${id}`, external_identifier: `external-${id}`, calendar_identifier: "calendar", source_identifier: "source", last_synced_snapshot: { ...calendarBase } });
    },
    linkTask(base: Item = taskBase) {
      tasks.set(1, { id: 1, ...base, completedAt: base.completionDate, reminders: [] });
      apple.set("reminder-1", { ...base, calendarItemIdentifier: "reminder-1", externalIdentifier: "external-task", calendarIdentifier: "list", sourceIdentifier: "source", alarms: [] });
      links.set(1, { id: 1, entity_type: "task", eo_id: 1, eventkit_entity_type: "reminder", calendar_item_identifier: "reminder-1", external_identifier: "external-task", calendar_identifier: "list", source_identifier: "source", last_synced_snapshot: { ...base } });
    },
    async native(method: string, body: Item) {
      calls.push({ method, target: method, body });
      if (method === "host.getInfo") return { methods: f.lookupAvailable ? ["eventkit.getItem", "eventkit.recover"] : [] };
      if (method === "eventkit.fetch") return { items: [...apple.values()].filter(item => item.calendarIdentifier === (body.kind === "calendar" ? "calendar" : "list") && !batchMissing.has(String(item.calendarItemIdentifier))) };
      if (method === "eventkit.getItem") {
        const item = apple.get(String(body.calendarItemIdentifier));
        return f.lookupResult ? { status: f.lookupResult } : item ? { status: "found", item } : { status: "missing" };
      }
      if (method === "eventkit.recover") {
        if (f.lookupResult) return { status: f.lookupResult };
        const bindings = body.bindings as Item[], token = body.recoveryToken, external = body.externalIdentifiers as string[] ?? [];
        const candidates = [...apple.values()].filter(item => (body.kind === "calendar" ? String(item.calendarItemIdentifier).startsWith("event") : !String(item.calendarItemIdentifier).startsWith("event")) && (external.includes(String(item.externalIdentifier)) || bindings.some(binding => binding.calendar_item_identifier === item.calendarItemIdentifier || (binding.external_identifier && binding.external_identifier === item.externalIdentifier)) || (token && item.url === eventKitRecoveryURL(String(token)))));
        return candidates.length > 1 ? { status: "ambiguous" } : candidates.length ? { status: "found", item: candidates[0] } : bindings.length && !bindings.some(binding => binding.external_identifier) ? { status: "unavailable" } : { status: "missing" };
      }
      if (method === "eventkit.save") {
        assert.equal(body.kind, "reminder", "Calendar must never write to Apple");
        const input = body.item as Item, id = String(input.calendarItemIdentifier ?? `new-reminder-${++nextApple}`), existing = apple.get(id), item = { ...input, url: existing?.url ?? (input.recoveryToken ? eventKitRecoveryURL(String(input.recoveryToken)) : undefined), calendarItemIdentifier: id, calendarIdentifier: input.calendarIdentifier, sourceIdentifier: "source", externalIdentifier: existing?.externalIdentifier ?? `external-${id}` };
        apple.set(id, item); return { item };
      }
      if (method === "eventkit.delete") { assert.equal(body.kind, "reminder"); apple.delete(String(body.calendarItemIdentifier)); return {}; }
      throw new Error(`Unexpected native call ${method}`);
    },
    async fetch(input: string | URL | Request, init?: RequestInit) {
      const url = new URL(String(input), "https://eo.test"), path = url.pathname, method = init?.method ?? "GET", body: Item = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, target: path, body });
      if (path === "/api/eventkit/links") {
        if (method === "GET") return Response.json([...links.values()].map(link => f.includeEOFlags ? { ...link, eo_record_missing: link.entity_type === "calendar_event" ? !events.has(Number(link.eo_id)) : link.entity_type === "task" ? !tasks.has(Number(link.eo_id)) : true } : link));
        if (method === "DELETE") { links.delete(Number(body.id)); return new Response(null, { status: 204 }); }
        if (method === "POST") {
          const key = `${body.entityType}:${body.eoId}`, reserved = logical.get(key) ?? { recovery_token: `00000000-0000-4000-8000-${String(body.eoId).padStart(12,"0")}`, initial_snapshot: body.lastSyncedSnapshot };
          logical.set(key, reserved);
          if (![...links.values()].some(link => link.entity_type === body.entityType && link.eo_id === body.eoId)) links.set(Number(body.eoId), { id: 0, logical_link_id: reserved.recovery_token, recovery_token: reserved.recovery_token, binding_state: "pending", entity_type: body.entityType, eo_id: body.eoId, eventkit_entity_type: "reminder", calendar_item_identifier: "", calendar_identifier: "", source_identifier: "", last_synced_snapshot: reserved.initial_snapshot, bindings: [] });
          return Response.json(reserved);
        }
        if (f.failBindingCode) { const code = f.failBindingCode; f.failBindingCode = ""; return Response.json({ error: "EO record disappeared", code }, { status: 409 }); }
        if (f.failBinding) { f.failBinding = false; return Response.json({ error: "binding failed" }, { status: 500 }); }
        const existing = [...links.values()].find(link => link.entity_type === body.entityType && link.eo_id === body.eoId), id = Number(existing?.id ?? links.size + 1);
        const reserved = logical.get(`${body.entityType}:${body.eoId}`);
        const key = existing ? [...links.entries()].find(([,link]) => link === existing)![0] : id;
        links.set(key, { id: key, logical_link_id: reserved?.recovery_token, recovery_token: reserved?.recovery_token, binding_state: "current", entity_type: body.entityType, eo_id: body.eoId, eventkit_entity_type: body.eventkitEntityType, calendar_item_identifier: body.calendarItemIdentifier, external_identifier: body.externalIdentifier, calendar_identifier: body.calendarIdentifier, source_identifier: body.sourceIdentifier, last_synced_snapshot: body.lastSyncedSnapshot });
        return Response.json(links.get(key));
      }
      if (path === "/api/tasks") return Response.json([...tasks.values()]);
      if (path === "/api/tasks/1" && method === "GET") return tasks.has(1) ? Response.json(tasks.get(1)) : Response.json({ error: "not found" }, { status: 404 });
      if (path === "/api/reminders") return Response.json([]);
      if (path === "/api/tasks/1/eventkit") { const patch = body.task as Item; tasks.set(1, { ...tasks.get(1), ...patch, completedAt: patch.completionDate }); return Response.json(tasks.get(1)); }
      if (path === "/api/eventkit/calendar-import") {
        assert.equal(method, "POST");
        if (f.failImport === "missing-eo-conflict") { f.failImport = ""; return Response.json({ error: "EO record disappeared", code: "eventkit_eo_missing" }, { status: 409 }); }
        if (f.failImport === "before-commit") { f.failImport = ""; return Response.json({ error: "mapping insert failed" }, { status: 500 }); }
        const item = body.apple as Item, linked = [...links.values()].find(link => link.calendar_item_identifier === item.calendarItemIdentifier), id = linked && events.has(Number(linked.eo_id)) ? Number(linked.eo_id) : ++nextEvent;
        if (!events.has(id)) {
          events.set(id, { id, ...body.snapshot as Item });
          links.set(id, { id, entity_type: "calendar_event", eo_id: id, eventkit_entity_type: "event", calendar_item_identifier: item.calendarItemIdentifier, external_identifier: item.externalIdentifier, calendar_identifier: item.calendarIdentifier, source_identifier: item.sourceIdentifier, last_synced_snapshot: body.snapshot });
        }
        if (f.failImport === "after-commit") { f.failImport = ""; return Response.json({ error: "response lost" }, { status: 500 }); }
        return Response.json({ id });
      }
      if (path === "/api/calendar-events") {
        assert.equal(method, "GET", "Imports must use the transactional endpoint");
        const afterId = Number(url.searchParams.get("afterId"));
        return Response.json([...events.values()].filter(event => Number(event.id) > afterId && !listMissing.has(Number(event.id))).sort((a, b) => Number(a.id) - Number(b.id)).slice(0, Number(url.searchParams.get("limit"))));
      }
      if (path.startsWith("/api/calendar-events/")) {
        const id = Number(path.split("/").at(-1));
        if (f.failEORead && method === "GET") return Response.json({ error: "database unavailable" }, { status: 503 });
        if (!events.has(id)) return Response.json({ error: "not found" }, { status: 404 });
        if (method === "DELETE") { events.delete(id); return new Response(null, { status: 204 }); }
        if (method === "PATCH") events.set(id, { ...events.get(id), ...body });
        return Response.json(events.get(id));
      }
      throw new Error(`Unexpected request ${method} ${path}`);
    },
    run(modes: EventKitModes = { calendar: "import" as const, list: "two_way" as const }, info = status) { return synchronizeEventKit(info, modes, { tasks: "list" }); },
    writes() { return calls.filter(call => ["POST", "PUT", "PATCH", "DELETE", "eventkit.save", "eventkit.delete"].includes(call.method)); },
  };
  return f;
}
async function withFixture(run: (f: ReturnType<typeof fixture>) => Promise<void>) {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch, f = fixture();
  globalThis.window = Object.assign(new EventTarget(), { EvaOrbitNative: { version: 1, call: async (method: string, body: Item = {}) => ({ ok: true, result: await f.native(method, body) }) } }) as unknown as Window & typeof globalThis;
  globalThis.fetch = f.fetch;
  try { await run(f); } finally { globalThis.window = oldWindow; globalThis.fetch = oldFetch; }
}

test("610 Calendar mappings paginate every EO record and updates keep the original ID", async () => withFixture(async f => {
  for (let id = 1; id <= 610; id++) f.linkEvent(id);
  f.reinstall();
  f.apple.set("event-610", { ...f.apple.get("event-610"), title: "Updated", notes: "New notes", location: "Clinic", isAllDay: true, startAt: "2026-10-07", endAt: "2026-10-08" });
  await f.run(); await f.run();
  assert.equal(f.events.size, 610); assert.equal(f.links.size, 610);
  assert.equal(f.events.get(610)?.title, "Updated"); assert.equal(f.events.get(610)?.isAllDay, true);
  assert.equal(f.calls.filter(call => call.method === "POST").length, 0);
  assert.equal(f.calls.filter(call => call.method === "GET" && call.target === "/api/calendar-events").length, 6);
  assert.ok(f.calls.some(call => call.method === "GET" && call.target === "/api/calendar-events/610"));
}));
test("EventKit completion announces Calendar changes once and an unchanged retry stays quiet", async () => withFixture(async f => {
  const notifications: DataChangedDetail[] = []; window.addEventListener(dataChangedEvent, event => notifications.push((event as CustomEvent).detail));
  f.linkEvent(1); f.events.clear(); f.links.clear();
  await f.run(); assert.deepEqual(notifications.map(item => item.domains), [["calendar"]]);
  assert.equal(notifications[0].source, "eventkit");
  await f.run(); assert.equal(notifications.length, 1);
  f.apple.set("event-1", { ...f.apple.get("event-1"), title: "Changed" }); await f.run();
  assert.deepEqual(notifications.map(item => item.domains), [["calendar"], ["calendar"]]);
}));
test("Controlled Apple Task edits notify Task and Due Reminder consumers", async () => withFixture(async f => {
  const notifications: DataChangedDetail[] = []; window.addEventListener(dataChangedEvent, event => notifications.push((event as CustomEvent).detail));
  f.linkTask(); f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), title: "Apple title" });
  await f.run(); assert.deepEqual(notifications.map(item => item.domains), [["tasks", "reminders"]]);
}));
test("Changes committed before a later failure still notify Web consumers", async () => withFixture(async f => {
  const notifications: DataChangedDetail[] = []; window.addEventListener(dataChangedEvent, event => notifications.push((event as CustomEvent).detail));
  f.linkTask(); f.linkEvent(2); f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), title: "Committed title" }); f.failEORead = true;
  await assert.rejects(f.run(), /database unavailable/);
  assert.equal(f.tasks.get(1)?.title, "Committed title"); assert.deepEqual(notifications.map(item => item.domains), [["tasks", "reminders"]]);
}));
for (const recovery of [false, true]) for (const flags of [false, true]) {
  test(`Missing EO records pause only their links and allow a new Calendar import (recovery=${recovery}, flags=${flags})`, async () => withFixture(async f => {
    f.includeEOFlags = flags;
    f.linkTask(); f.tasks.clear();
    for (let id = 2; id <= 611; id++) f.linkEvent(id);
    f.events.clear();
    if (recovery) f.reinstall();
    const oldLinks = structuredClone([...f.links.values()]);
    f.apple.set("event-new", { ...calendarBase, title: "New appointment", calendarItemIdentifier: "event-new", externalIdentifier: "external-new", calendarIdentifier: "calendar", sourceIdentifier: "source" });
    const result = await f.run(); await f.run();
    assert.equal(f.events.size, 1); assert.equal([...f.events.values()][0].title, "New appointment");
    assert.equal(result.imported, 1); assert.equal(result.conflicts.filter(conflict => conflict.fields.includes("eo_missing")).length, 611);
    assert.deepEqual([...f.links.values()].slice(0, 611), oldLinks);
    assert.equal(f.apple.size, 612); assert.equal(f.calls.filter(call => call.method === "eventkit.delete").length, 0);
    assert.equal(f.calls.filter(call => call.target === "/api/eventkit/calendar-import").length, 1);
    assert.equal(f.calls.filter(call => call.method === "PUT" && call.target === "/api/eventkit/links").length, 0);
  }));
}
test("Changed Apple identifiers still match a paused missing-EO relationship", async () => withFixture(async f => {
  f.linkEvent(2); f.events.clear(); f.reinstall();
  f.apple.delete("event-2"); f.apple.set("event-renamed", { ...calendarBase, calendarItemIdentifier: "event-renamed", externalIdentifier: "external-2", calendarIdentifier: "calendar", sourceIdentifier: "source" });
  const result = await f.run(); assert.equal(result.imported, 0); assert.equal(f.events.size, 0); assert.equal(f.links.size, 1); assert.equal(f.writes().length, 0);
}));
test("An orphan without a durable Apple identity retains the recovery safety barrier", async () => withFixture(async f => {
  f.linkEvent(2); f.events.clear(); f.links.set(2, { ...f.links.get(2), external_identifier: null }); f.reinstall();
  f.apple.delete("event-2"); f.apple.set("event-unknown", { ...calendarBase, calendarItemIdentifier: "event-unknown", calendarIdentifier: "calendar", sourceIdentifier: "source" });
  await f.run(); assert.equal(f.events.size, 0); assert.equal(f.links.size, 1); assert.equal(f.writes().length, 0);
}));
test("A changed orphan Reminder marker cannot be adopted by an unrelated Task", async () => withFixture(async f => {
  f.linkTask(); f.tasks.clear(); f.reinstall();
  const original = f.apple.get("reminder-1"); f.apple.delete("reminder-1");
  f.apple.set("reminder-renamed", { ...original, calendarItemIdentifier: "reminder-renamed", externalIdentifier: "new-external", url: eventKitRecoveryURL(String(f.links.get(1)?.recovery_token)) });
  f.tasks.set(9, { id: 9, ...taskBase, completedAt: null, reminders: [] });
  await f.run(); assert.equal(f.apple.size, 2); assert.equal(f.links.get(1)?.eo_id, 1);
  assert.notEqual([...f.links.values()].find(link => link.eo_id === 9)?.calendar_item_identifier, "reminder-renamed");
}));
test("An EO record removed during recovery pauses that binding without stopping a new Calendar import", async () => withFixture(async f => {
  f.linkTask(); f.reinstall(); f.failBindingCode = "eventkit_eo_missing";
  f.apple.set("event-new", { ...calendarBase, calendarItemIdentifier: "event-new", externalIdentifier: "external-new", calendarIdentifier: "calendar", sourceIdentifier: "source" });
  const result = await f.run(); assert.equal(result.imported, 1); assert.equal(f.links.get(1)?.binding_state, "recovery");
  assert.ok(result.conflicts.some(conflict => conflict.eoId === 1 && conflict.fields.includes("eo_missing")));
}));
test("An import refused for an old missing-EO identity does not stop unrelated new events", async () => withFixture(async f => {
  f.linkEvent(1); f.linkEvent(2); f.events.clear(); f.links.clear(); f.failImport = "missing-eo-conflict";
  const result = await f.run(); assert.equal(f.events.size, 1); assert.equal(result.imported, 1); assert.deepEqual(result.conflicts[0].fields, ["eo_missing"]);
}));
test("Calendar diagnostics distinguish reads, new imports, updates and preserved missing-EO links", async () => withFixture(async f => {
  f.linkEvent(1); f.linkEvent(2); f.linkEvent(3); f.events.delete(2); f.links.delete(3); f.events.delete(3);
  f.apple.set("event-1", { ...f.apple.get("event-1"), title: "Updated" });
  const result = await f.run(); assert.equal(result.calendarDiagnostics?.readEvents, 3); assert.equal(result.calendarDiagnostics?.newImports, 1); assert.equal(result.calendarDiagnostics?.updatedEvents, 1);
  assert.match(eventKitSyncDiagnosticText(result), /读取 3 条，新导入 1 条，更新 1 条/); assert.match(eventKitSyncDiagnosticText(result), /暂停 1 条旧关联/);
}));
test("Diagnostics expose a disabled Calendar source without treating it as an empty store", async () => withFixture(async f => {
  f.linkEvent(1); const result = await f.run({ calendar: "off", list: "two_way" });
  assert.equal(result.calendarDiagnostics?.readEvents, 0); assert.match(eventKitSyncDiagnosticText(result), /事件所在日历设为 Import only/); assert.equal(f.events.size, 1);
}));
test("Mapped Calendar objects outside both batch windows still update the original EO ID", async () => withFixture(async f => {
  f.linkEvent(1); f.batchMissing.add("event-1"); f.listMissing.add(1);
  f.apple.set("event-1", { ...f.apple.get("event-1"), title: "Moved", startAt: "2030-01-01T01:00:00Z", endAt: "2030-01-01T02:00:00Z" });
  await f.run(); assert.equal(f.events.size, 1); assert.equal(f.events.get(1)?.title, "Moved"); assert.equal(f.links.get(1)?.eo_id, 1);
  assert.deepEqual(f.writes().map(call => call.method), ["PATCH", "PUT"]);
}));
test("Calendar deletion requires a confirmed direct lookup miss", async () => withFixture(async f => {
  f.linkEvent(1); f.apple.delete("event-1"); await f.run();
  assert.ok(f.calls.some(call => call.method === "eventkit.getItem")); assert.equal(f.events.size, 0); assert.equal(f.links.size, 0);
}));
for (const reason of ["unavailable", "legacy-host", "paused", "revoked", "source-missing"]) {
  test(`Missing batches preserve Calendar and Task links when ${reason}`, async () => withFixture(async f => {
    f.linkEvent(2); f.linkTask(); f.batchMissing.add("event-2"); f.batchMissing.add("reminder-1");
    if (reason === "unavailable") f.lookupResult = "unavailable";
    if (reason === "legacy-host") f.lookupAvailable = false;
    const info = reason === "revoked" ? { ...status, calendarPermission: "denied", reminderPermission: "denied" } : reason === "source-missing" ? { ...status, calendars: [], reminderLists: [] } : status;
    if (reason === "paused") await synchronizeEventKit(info, { calendar: "off", list: "off" }); else await f.run(undefined, info);
    assert.equal(f.events.size, 1); assert.equal(f.tasks.size, 1); assert.equal(f.links.size, 2); assert.equal(f.writes().length, 0);
  }));
}
test("EO direct-read errors never unlink or reimport a mapped Calendar event", async () => withFixture(async f => {
  f.linkEvent(1); f.failEORead = true; await assert.rejects(f.run(), /database unavailable/); assert.equal(f.writes().length, 0);
}));
for (const failure of ["before-commit", "after-commit"]) {
  test(`Calendar import retry reuses one EO record after failure ${failure}`, async () => withFixture(async f => {
    f.linkEvent(1); f.links.clear(); f.events.clear(); f.failImport = failure;
    await assert.rejects(f.run(), /mapping insert failed|response lost/);
    assert.equal(f.events.size, failure === "before-commit" ? 0 : 1);
    const committedID = [...f.events.keys()][0];
    await f.run(); await f.run(); assert.equal(f.events.size, 1); assert.equal(f.links.size, 1);
    if (committedID) assert.equal([...f.events.keys()][0], committedID);
  }));
}
test("A directly read old completed Reminder is reopened in place", async () => withFixture(async f => {
  f.linkTask({ ...taskBase, completed: true, completionDate: "2026-08-01T00:00:00Z" }); f.batchMissing.add("reminder-1");
  f.tasks.set(1, { ...f.tasks.get(1), completed: false, completedAt: null }); await f.run();
  assert.equal(f.apple.size, 1); assert.equal(f.apple.get("reminder-1")?.completed, false);
  assert.equal(f.links.get(1)?.calendar_item_identifier, "reminder-1");
}));
for (const completed of [false, true]) {
  test(`Confirmed Reminder deletion uses current Task completed=${completed}`, async () => withFixture(async f => {
    f.linkTask({ ...taskBase, completed: true, completionDate: "2026-08-01T00:00:00Z" }); f.apple.delete("reminder-1");
    f.tasks.set(1, { ...f.tasks.get(1), completed, completedAt: completed ? "2026-08-01T00:00:00+00:00" : null });
    await f.run(); assert.equal(f.tasks.size, 1); assert.equal(f.apple.size, completed ? 0 : 1);
    assert.equal(f.links.size, 1); assert.equal(f.links.get(1)?.calendar_item_identifier, completed ? "reminder-1" : "new-reminder-1");
  }));
}
test("Task EO edits update the mirror and Apple edits write back to the original Task", async () => withFixture(async f => {
  f.linkTask(); f.tasks.set(1, { ...f.tasks.get(1), title: "EO title", notes: "EO notes", dueTime: "09:30" }); await f.run();
  assert.equal(f.apple.size, 1); assert.equal(f.apple.get("reminder-1")?.dueTime, "09:30");
  f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), title: "Apple title", dueDate: "2026-10-08", completed: true, completionDate: "2026-10-04T12:00:00+08:00" }); await f.run();
  assert.equal(f.tasks.size, 1); assert.equal(f.tasks.get(1)?.title, "Apple title"); assert.equal(f.tasks.get(1)?.completedAt, "2026-10-04T04:00:00.000Z");
}));
test("Equivalent timestamp formats do not create conflicts or changed snapshots", async () => {
  const base = { startAt: "2026-10-04T00:00:00Z", completionDate: "2026-10-04T00:00:00Z", dueDate: "2026-10-04" }, eo = { ...base, startAt: "2026-10-04T08:00:00+08:00", completionDate: "2026-10-04T00:00:00.000+00:00" }, apple = { ...base, completionDate: "2026-10-04T01:00:00Z" };
  const result = mergeEventKitSnapshots(base, eo, apple); assert.deepEqual(result.conflicts, []); assert.equal(result.eoChanged, false); assert.equal(result.appleChanged, true);
  assert.equal(eventKitCanonicalSnapshot(base).dueDate, "2026-10-04"); assert.equal(await eventKitSnapshotHash(base), await eventKitSnapshotHash(eo));
});

test("Reinstallation recovers changed Calendar identifiers outside the window into the original EO ID", async () => withFixture(async f => {
  f.linkEvent(71); f.reinstall(); f.apple.delete("event-71");
  f.apple.set("event-new", { ...calendarBase, title: "After reinstall", calendarItemIdentifier: "event-new", externalIdentifier: "external-71", calendarIdentifier: "calendar", sourceIdentifier: "source", startAt: "2030-10-01T01:00:00Z", endAt: "2030-10-01T02:00:00Z" });
  f.batchMissing.add("event-new"); f.listMissing.add(71);
  await f.run(); await f.run();
  assert.equal(f.events.size, 1); assert.equal(f.events.get(71)?.title, "After reinstall");
  assert.equal(f.links.get(71)?.calendar_item_identifier, "event-new"); assert.equal(f.calls.filter(call => call.target === "/api/eventkit/calendar-import").length, 0);
}));
test("Reinstallation reattaches a changed Reminder and writes back to the original Task", async () => withFixture(async f => {
  f.linkTask(); f.reinstall(); f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), title: "Apple edit", completed: true, completionDate: "2026-10-05T01:00:00Z" }); f.batchMissing.add("reminder-1");
  await f.run(); assert.equal(f.tasks.get(1)?.title, "Apple edit"); assert.equal(f.tasks.get(1)?.completed, true); assert.equal(f.apple.size, 1);
  assert.equal(f.calls.filter(call => call.method === "eventkit.save" && !(call.body.item as Item).calendarItemIdentifier).length, 0);
}));
test("A server-reserved Reminder marker survives a failed binding and reinstall retry", async () => withFixture(async f => {
  f.tasks.set(1, { id: 1, ...taskBase, completedAt: null, reminders: [] }); f.failBinding = true;
  await assert.rejects(f.run(), /binding failed/); assert.equal(f.apple.size, 1); assert.equal(f.links.get(1)?.binding_state, "pending");
  const original = [...f.apple.keys()][0]; f.apple.set(original, { ...f.apple.get(original), title: "Changed while unbound" });
  await f.run(); await f.run(); assert.equal(f.apple.size, 1); assert.equal(f.tasks.size, 1); assert.equal(f.tasks.get(1)?.title, "Changed while unbound");
  assert.equal(f.links.get(1)?.calendar_item_identifier, original);
}));
for (const reason of ["ambiguous", "unavailable"]) test(`Reinstallation ${reason} preserves relations and prevents new Calendar imports and Reminder creation`, async () => withFixture(async f => {
  f.linkEvent(2); f.linkTask(); f.reinstall(); f.lookupResult = reason;
  f.apple.set("event-unrecognized", { ...calendarBase, calendarItemIdentifier: "event-unrecognized", calendarIdentifier: "calendar", sourceIdentifier: "source" });
  f.tasks.set(9, { id: 9, ...taskBase, title: "New task", completedAt: null });
  const result = await f.run(); assert.equal(f.events.size, 1); assert.equal(f.links.size, 2); assert.equal(f.writes().length, 0); assert.equal(result.conflicts.length, 2);
}));
test("Repeated external identities pause instead of adopting the first candidate", async () => withFixture(async f => {
  f.linkEvent(1); f.reinstall(); f.apple.set("event-copy", { ...f.apple.get("event-1"), calendarItemIdentifier: "event-copy" });
  const result = await f.run(); assert.equal(f.events.size, 1); assert.equal(f.writes().length, 0); assert.deepEqual(result.conflicts[0].fields, ["identity"]);
}));
test("Existing user Reminder URLs survive marker backfill and normal EO updates", async () => withFixture(async f => {
  f.linkTask(); f.reinstall(); f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), url: "https://example.com/my-link" });
  f.tasks.set(1, { ...f.tasks.get(1), title: "Updated EO" }); await f.run();
  assert.equal(f.apple.get("reminder-1")?.url, "https://example.com/my-link"); assert.equal(f.apple.size, 1);
}));
test("Recovery keeps the historical baseline and reports genuine edits on both sides", async () => withFixture(async f => {
  f.linkTask(); f.reinstall(); f.tasks.set(1, { ...f.tasks.get(1), title: "EO edit" }); f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), title: "Apple edit" });
  const result = await f.run(); assert.ok(result.conflicts.some(conflict => conflict.fields.includes("title"))); assert.equal(f.tasks.get(1)?.title, "EO edit"); assert.equal(f.apple.size, 1);
}));
test("A duplicate external identity on a first import is paused without creating either EO record", async () => withFixture(async f => {
  f.linkEvent(1); f.links.clear(); f.events.clear(); f.apple.set("event-copy", { ...f.apple.get("event-1"), calendarItemIdentifier: "event-copy" });
  const result = await f.run(); assert.equal(f.events.size, 0); assert.equal(f.writes().length, 0); assert.ok(result.conflicts.length > 0);
}));
test("Changed local IDs without a recoverable Calendar identity preserve the original EO record", async () => withFixture(async f => {
  f.linkEvent(1); f.links.set(1, { ...f.links.get(1), external_identifier: null }); f.apple.delete("event-1"); f.reinstall();
  f.apple.set("event-unknown", { ...calendarBase, calendarItemIdentifier: "event-unknown", calendarIdentifier: "calendar", sourceIdentifier: "source" });
  await f.run(); assert.equal(f.events.size, 1); assert.equal(f.links.size, 1); assert.equal(f.writes().length, 0);
}));
test("Moving a recovered Task mirror to a new routed list preserves controlled Apple edits", async () => withFixture(async f => {
  f.linkTask(); f.reinstall(); f.apple.set("reminder-1", { ...f.apple.get("reminder-1"), title: "Apple edit before reinstall" });
  await synchronizeEventKit({ ...status, reminderLists: [source("list"), source("new-list")] }, { calendar: "import" }, { tasks: "new-list" });
  assert.equal(f.tasks.get(1)?.title, "Apple edit before reinstall"); assert.equal(f.apple.size, 1); assert.equal(f.apple.get("reminder-1")?.calendarIdentifier, "new-list");
}));
test("A completed pending Task does not recreate a mirror or block other Tasks", async () => withFixture(async f => {
  f.tasks.set(1, { id: 1, ...taskBase, completedAt: null, reminders: [] }); f.failBinding = true;
  await assert.rejects(f.run(), /binding failed/); f.apple.clear();
  f.tasks.set(1, { ...f.tasks.get(1), completed: true, completedAt: "2026-10-05T00:00:00Z" });
  f.tasks.set(9, { id: 9, ...taskBase, title: "Other Task", completedAt: null, reminders: [] });
  await f.run(); assert.equal(f.apple.size, 1); assert.equal([...f.apple.values()][0].title, "Other Task"); assert.equal(f.links.get(1)?.binding_state, "pending");
}));
