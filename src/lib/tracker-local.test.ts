import assert from "node:assert/strict";
import test from "node:test";
import { LocalTrackerStore, mergeTrackerResponse, emptyTrackerState, type TrackerLocalState, type TrackerStorage } from "./tracker-local-store.ts";
import { parseTrackerSyncRequest, type TrackerRemote, type TrackerSyncResponse } from "./tracker-local-contract.ts";
import type { TrackerTransport } from "./tracker-local-store.ts";

const account = "10000000-0000-4000-8000-000000000001";
function storage() {
  let state: TrackerLocalState | null = null;
  const adapter: TrackerStorage = {
    async read() { return structuredClone(state); },
    async commit(revision, next) { if ((state?.revision ?? 0) !== revision) return false; state = structuredClone(next); return true; },
  };
  return adapter;
}
function cloud() {
  let id = 0;
  let revision = 0;
  const records: TrackerRemote[] = [];
  const receipts = new Map<string, { request: string; result: TrackerSyncResponse["results"][number] }>();
  const requests: unknown[] = [];
  const transport: TrackerTransport = async request => {
    parseTrackerSyncRequest(request); requests.push(structuredClone(request));
    const results: TrackerSyncResponse["results"] = [];
    for (const item of request.mutations) {
      const saved = receipts.get(item.mutationId);
      if (saved) {
        assert.equal(JSON.stringify(item), saved.request, "retries must not change the frozen command");
        results.push({ ...saved.result, status: saved.result.status === "applied" ? "duplicate" : saved.result.status }); continue;
      }
      let remote = records.find(row => row.resourceType === item.resourceType && row.serverId === item.serverId);
      let result: TrackerSyncResponse["results"][number];
      if (item.operation !== "create" && (!remote || remote.version !== item.baseVersion)) result = { mutationId: item.mutationId, status: "conflict" };
      else if (item.resourceType !== "tracker" && item.operation !== "delete" && records.find(row => row.resourceType === "tracker" && row.serverId === item.payload.trackerId)?.version !== item.parentVersion) result = { mutationId: item.mutationId, status: "conflict" };
      else {
        if (item.operation === "create") { remote = { resourceType: item.resourceType, serverId: ++id, version: 1, payload: { ...item.payload, id } }; records.push(remote); }
        else if (item.operation === "update") { remote!.payload = { ...remote!.payload, ...item.payload }; remote!.version++; }
        else records.splice(records.indexOf(remote!), 1);
        if (item.resourceType === "tracker_field") records.find(row => row.resourceType === "tracker" && row.serverId === item.payload.trackerId)!.version++;
        result = { mutationId: item.mutationId, status: "applied", serverId: remote!.serverId, version: remote!.version };
      }
      receipts.set(item.mutationId, { request: JSON.stringify(item), result }); results.push(result);
    }
    return structuredClone({ protocolVersion: 2, accountId: request.accountId, results, snapshot: { complete: true, revision: ++revision, records } });
  };
  return { records, requests, transport };
}

test("offline parent/field/record survives restart, maps IDs and drains dependency batches", async () => {
  const disk = storage(), store = new LocalTrackerStore(account, disk), remote = cloud();
  await store.initialize();
  const tracker = await store.createTracker({ name: "Sleep" }, { key: crypto.randomUUID(), name: "Hours", type: "number" });
  const entry = await store.save("tracker_entry", undefined, { trackerLocalId: tracker, occurredAt: "2026-10-18T04:00:00Z", values: {}, note: "offline" });
  await store.save("tracker_entry", entry, { trackerLocalId: tracker, note: "edited offline" });
  const restarted = new LocalTrackerStore(account, disk); await restarted.initialize();
  assert.equal(restarted.getSnapshot().records.find(row => row.id === entry)?.payload.note, "edited offline");
  await restarted.synchronize(remote.transport);
  assert.equal(restarted.getSnapshot().outbox.length, 0);
  assert.equal(remote.records.find(row => row.resourceType === "tracker_entry")?.payload.note, "edited offline");
  await restarted.remove(entry); await restarted.synchronize(remote.transport);
  assert.equal(remote.records.filter(row => row.resourceType === "tracker_entry").length, 0);
});

test("lost response replays identical command, including edits made while upload was running", async () => {
  const disk = storage(), store = new LocalTrackerStore(account, disk), remote = cloud();
  await store.initialize();
  const tracker = await store.createTracker({ name: "First" });
  let failed = false;
  await assert.rejects(() => store.synchronize(async request => {
    const response = await remote.transport(request);
    if (!failed) { failed = true; await store.save("tracker", tracker, { name: "New edit" }); throw new Error("response lost"); }
    return response;
  }));
  const restarted = new LocalTrackerStore(account, disk); await restarted.initialize();
  await restarted.synchronize(remote.transport);
  assert.equal(remote.records.length, 1);
  assert.equal(remote.records[0].payload.name, "New edit");
  assert.equal(restarted.getSnapshot().outbox.length, 0);
});

test("two unsynced parents never associate children through undefined server IDs", async () => {
  const store = new LocalTrackerStore(account, storage()), remote = cloud(); await store.initialize();
  await store.createTracker({ name: "First" });
  const second = await store.createTracker({ name: "Second" }, { key: crypto.randomUUID(), name: "Field", type: "text" });
  await store.save("tracker_entry", undefined, { trackerLocalId: second, occurredAt: "2026-10-18T04:00:00Z", values: {}, note: "belongs to second" });
  await store.synchronize(remote.transport);
  const parentId = remote.records.find(row => row.resourceType === "tracker" && row.payload.name === "Second")!.serverId;
  assert(remote.records.filter(row => row.resourceType !== "tracker").every(row => row.payload.trackerId === parentId));
});

test("Web/MCP edits and deletes preserve dirty data and expose explicit resolution", async () => {
  const store = new LocalTrackerStore(account, storage()), remote = cloud(); await store.initialize();
  const tracker = await store.createTracker({ name: "Base" }); await store.synchronize(remote.transport);
  await store.save("tracker", tracker, { name: "Local" });
  remote.records[0].payload.name = "MCP"; remote.records[0].version++;
  await store.synchronize(remote.transport);
  assert.equal(store.getSnapshot().records[0].payload.name, "Local");
  assert.equal(store.getSnapshot().records[0].status, "conflict");
  await store.resolve(tracker, "local"); await store.synchronize(remote.transport);
  assert.equal(remote.records[0].payload.name, "Local");
  await store.save("tracker", tracker, { name: "Unsynced" }); remote.records.splice(0);
  await store.synchronize(remote.transport);
  assert.equal(store.getSnapshot().records[0].remote, null);
  assert.equal(store.getSnapshot().records[0].payload.name, "Unsynced");
  await store.resolve(tracker, "remote"); assert.equal(store.getSnapshot().records.length, 0);
});

test("large queues are bounded, clean remote deletions propagate and two windows use CAS", async () => {
  const disk = storage(), store = new LocalTrackerStore(account, disk), remote = cloud(); await store.initialize();
  const secondWindow = new LocalTrackerStore(account, disk); await secondWindow.initialize();
  for (let n = 0; n < 125; n++) await store.createTracker({ name: `Tracker ${n}` });
  await secondWindow.createTracker({ name: "Other window" });
  await store.synchronize(remote.transport);
  assert.equal(remote.records.length, 126);
  assert(remote.requests.every(request => (request as { mutations: unknown[] }).mutations.length <= 50));
  remote.records.splice(0, 1); await store.synchronize(remote.transport);
  assert.equal(store.getSnapshot().records.length, 125);
});

test("incomplete, wrong-account and malformed receipts never erase local data", () => {
  const state = emptyTrackerState(account); state.records.push({ id: "local", resourceType: "tracker", serverId: 1, version: 1, payload: { name: "Keep" } });
  const response: TrackerSyncResponse = { protocolVersion: 2, accountId: account, results: [], snapshot: { complete: true, revision: 1, records: [] } };
  assert.throws(() => mergeTrackerResponse(state, { ...response, snapshot: { ...response.snapshot, complete: false } } as unknown as TrackerSyncResponse, []));
  assert.throws(() => mergeTrackerResponse(state, { ...response, accountId: "other" }, []));
  assert.throws(() => mergeTrackerResponse(state, { ...response, results: [{ mutationId: "not-sent", status: "applied" }] }, []));
  assert.equal(state.records.length, 1);
  assert.throws(() => parseTrackerSyncRequest({ protocolVersion: 1, mutations: [] }));
});

test("late snapshots cannot erase records already received by another window", () => {
  const state = emptyTrackerState(account);
  mergeTrackerResponse(state, { protocolVersion: 2, accountId: account, results: [], snapshot: { complete: true, revision: 5, records: [{ resourceType: "tracker", serverId: 1, version: 2, payload: { name: "Newer" } }] } }, []);
  mergeTrackerResponse(state, { protocolVersion: 2, accountId: account, results: [], snapshot: { complete: true, revision: 4, records: [] } }, []);
  assert.equal(state.records[0].payload.name, "Newer");
  assert.equal(state.remoteRevision, 5);
});
