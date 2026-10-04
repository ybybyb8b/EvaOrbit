import assert from "node:assert/strict";
import test from "node:test";
import { projectEventKitLinks } from "./eventkit-links.ts";

const logical = { id: "logical", entity_type: "task", eo_id: 12, eventkit_entity_type: "reminder", recovery_token: "marker", initial_snapshot: { title: "Initial" }, initial_hash: "initial" };
const old = { id: 7, logical_link_id: "logical", installation_id: "old", calendar_item_identifier: "apple", calendar_identifier: "list", source_identifier: "source", external_identifier: "external", last_synced_snapshot: { title: "Historical" }, last_synced_hash: "historical", last_synced_at: "2026-10-01T00:00:00Z" };
test("An installation change retains EO ID, history and the last valid merge baseline", () => {
  const [link] = projectEventKitLinks([logical], [old], "new");
  assert.equal(link.eo_id, 12); assert.equal(link.binding_state, "recovery"); assert.deepEqual(link.last_synced_snapshot, old.last_synced_snapshot); assert.deepEqual(link.bindings, [old]);
});
test("A current binding uses its own baseline rather than overwriting it with another device's", () => {
  const current = { ...old, id: 8, installation_id: "new", last_synced_snapshot: { title: "Current" }, last_synced_at: "2026-09-01T00:00:00Z" };
  const [link] = projectEventKitLinks([logical], [old, current], "new");
  assert.equal(link.binding_state, "current"); assert.deepEqual(link.last_synced_snapshot, current.last_synced_snapshot);
});
test("Pending next occurrences exclude old completed mirrors and retain the creation baseline", () => {
  const [link] = projectEventKitLinks([{ ...logical, pending_creation: true }], [{ ...old, recovery_token: "previous-generation" }], "new");
  assert.equal(link.binding_state, "pending"); assert.deepEqual(link.bindings, []); assert.deepEqual(link.last_synced_snapshot, logical.initial_snapshot);
});
test("Suspected duplicates are reported without merging records or removing bindings", () => {
  const records = [logical, { ...logical, id: "other", eo_id: 13 }], bindings = [old, { ...old, id: 8, logical_link_id: "other" }];
  const result = projectEventKitLinks(records, bindings, "new");
  assert.equal(result.length, 2); assert.ok(result.every(link => link.identity_conflict)); assert.deepEqual(result.map(link => link.eo_id), [12, 13]); assert.equal(bindings.length, 2);
});
test("A bound next occurrence does not recover historical completed mirrors from older installations", () => {
  const current = { ...old, id: 8, recovery_token: "marker", external_identifier: "next-external", installation_id: "new" };
  const [link] = projectEventKitLinks([{ ...logical, mirror_generation: "next", external_identifier: "next-external" }], [{ ...old, recovery_token: "previous" }, current], "reinstalled");
  assert.deepEqual(link.bindings, [current]); assert.deepEqual(link.external_identifiers, ["next-external"]);
});
