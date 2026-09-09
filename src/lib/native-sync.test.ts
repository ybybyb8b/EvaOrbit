import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conflictFor, parseNativeSyncRequest, type NativeSyncMutation, type NativeSyncResult } from "./native-sync-contract.ts";
import { applyIdempotently, type MutationReceiptStore } from "./native-sync-idempotency.ts";
import { parseNewTrackerField } from "./validation.ts";

const mutation: NativeSyncMutation = { mutationId: "019924d0-8c19-7bb3-8c12-a6c4f321b880", resourceType: "tracker", operation: "create", localId: "local-1", payload: { name: "Sleep" } };

test("parses the versioned native sync contract", () => {
  assert.deepEqual(parseNativeSyncRequest({ protocolVersion: 1, mutations: [mutation] }).mutations[0], mutation);
  assert.throws(() => parseNativeSyncRequest({ protocolVersion: 2, mutations: [] }));
  assert.throws(() => parseNativeSyncRequest({ protocolVersion: 1, mutations: [{ ...mutation, operation: "update" }] }));
  assert.throws(() => parseNativeSyncRequest({ protocolVersion: 1, mutations: [mutation, mutation] }));
  for (const resourceType of ["tracker_field", "tracker_goal", "tracker_reminder", "tracker_entry", "tracker_icon"] as const) {
    assert.equal(parseNativeSyncRequest({ protocolVersion: 1, mutations: [{ ...mutation, mutationId: crypto.randomUUID(), resourceType }] }).mutations[0].resourceType, resourceType);
  }
});

test("detects stale bases and remote deletes", () => {
  assert.equal(conflictFor("2026-09-09T00:00:00.000Z", { updatedAt: "2026-09-09T00:00:00.000Z" }), null);
  assert.equal(conflictFor("2026-09-08T00:00:00.000Z", { updatedAt: "2026-09-09T00:00:00.000Z" }), "stale_base");
  assert.equal(conflictFor("2026-09-09T00:00:00.000Z", null), "remote_deleted");
});

test("preserves a native field UUID so offline entry values keep their meaning", () => {
  const key = crypto.randomUUID();
  assert.equal(parseNewTrackerField({ trackerId: 1, key, name: "Comfort", type: "rating" }).key, key);
  assert.throws(() => parseNewTrackerField({ trackerId: 1, key: "unsafe", name: "Comfort", type: "rating" }));
});

test("replays a completed mutation without applying it twice", async () => {
  let saved: NativeSyncResult | undefined;
  const store: MutationReceiptStore = {
    async claim() { return saved ? { kind: "completed", result: saved } : { kind: "claimed" }; },
    async complete(_, result) { saved = result; },
    async release() {},
  };
  let applications = 0;
  const apply = async (): Promise<NativeSyncResult> => ({ mutationId: mutation.mutationId, resourceType: mutation.resourceType, localId: mutation.localId, status: "applied", serverId: ++applications });
  assert.equal((await applyIdempotently(mutation, store, apply)).status, "applied");
  assert.equal((await applyIdempotently(mutation, store, apply)).status, "duplicate");
  assert.equal(applications, 1);
});

test("keeps an in-flight duplicate retryable without applying concurrently", async () => {
  const store: MutationReceiptStore = {
    async claim() { return { kind: "processing" }; },
    async complete() {},
    async release() {},
  };
  let applications = 0;
  const result = await applyIdempotently(mutation, store, async () => {
    applications += 1;
    throw new Error("must not run");
  });
  assert.equal(result.status, "retry");
  assert.equal(applications, 0);
});

test("sync receipt migration is owner-scoped and server writes reuse Tracker services", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/202609090001_native_sync_mutations.sql", import.meta.url), "utf8");
  const service = readFileSync(new URL("native-sync-service.ts", import.meta.url), "utf8");
  assert.match(migration, /primary key \(user_id, mutation_id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to authenticated/i);
  assert.match(service, /createTrackerField.*createTrackerGoal.*createTrackerReminder.*deleteTrackerField.*deleteTrackerGoal.*deleteTrackerReminder/s);
  assert.match(service, /resetTrackerIcon.*saveTrackerIcon/s);
  assert.doesNotMatch(service, /from\("trackers"\)|from\("tracker_entries"\)/);
});
