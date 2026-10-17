import assert from "node:assert/strict";
import test from "node:test";
import { isCatHealthRecord, latestCatMeasurements, latestCatRecords } from "./cat-presentation.ts";
import type { CatMeasurement, CatTimelineEntry } from "./types.ts";

const event = (id: number, sourceId: number | null, date = "2026-10-17T10:00:00Z"): CatTimelineEntry => ({
  id, kind: "event", petId: 1, occurredAt: date, occurredHasExplicitTime: true,
  eventType: "care", title: "Same title", summary: "", metadata: { sourceType: sourceId ? "cat_routine" : null, sourceId },
});

test("routine presentation keeps the newest completion by source, without collapsing manual, one-time or other cats' records", () => {
  const records = [event(1, 10, "2026-10-01T10:00:00Z"), event(2, 20), event(3, 10), event(4, null), { ...event(5, 10), petId: 2 }, { ...event(6, 10), metadata: { sourceType: "reminder", sourceId: 10 } }];
  assert.deepEqual(latestCatRecords(records).map(item => item.id), [2, 3, 4, 5, 6]);
  assert.deepEqual(latestCatRecords(records.filter(item => item.id !== 3)).map(item => item.id), [1, 2, 4, 5, 6]);
  assert.equal(records.length, 6);
});

test("health history includes structured deworming and does not guess health from routine titles", () => {
  assert.equal(isCatHealthRecord({ ...event(1, null), eventType: "deworming" }), true);
  assert.equal(isCatHealthRecord({ ...event(2, 10), title: "Deworming" }), false);
  assert.equal(isCatHealthRecord({ ...event(3, null), kind: "symptom" }), true);
});

test("measurement overview keeps latest values separate by type and unit", () => {
  const measurement = (id: number, unit: string, occurredAt: string): CatMeasurement => ({ id, petId: 1, measurementType: "Weight", value: id, unit, occurredAt, occurredHasExplicitTime: false, note: "", createdAt: "", updatedAt: "" });
  const records = [measurement(1,"kg","2026-10-01T04:00:00Z"), measurement(2,"kg","2026-10-17T04:00:00Z"), measurement(3,"lb","2026-10-16T04:00:00Z")];
  assert.deepEqual(latestCatMeasurements(records).map(item => item.id), [2,3]);
  assert.deepEqual(latestCatMeasurements([]), []);
});
