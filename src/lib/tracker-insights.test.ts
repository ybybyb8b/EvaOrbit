import assert from "node:assert/strict";
import test from "node:test";
import { buildTrackerInsights, shiftTrackerMonth, trackerCalendarMonth, trackerHeatLevel } from "./tracker-insights.ts";
import type { TrackerEntry, TrackerField } from "./types.ts";

const field: TrackerField = { id: 7, trackerId: 1, key: "mood", name: "Mood", type: "rating", required: false, defaultValue: null, options: [], showAfterQuickCapture: false, includeInStats: true, sortOrder: 0, unit: "", precision: 1, config: {}, archivedAt: null, createdAt: "", updatedAt: "" };
const entry = (id: number, occurredAt: string, value: number): TrackerEntry => ({ id, trackerId: 1, occurredAt, endAt: null, values: { mood: value }, note: "", createdAt: occurredAt, updatedAt: occurredAt });

test("builds heatmap and field insights from point events", () => {
  const result = buildTrackerInsights([entry(2, "2026-08-25T12:00:00Z", 4), entry(1, "2026-08-25T08:00:00Z", 2)], [field], new Date("2026-08-26T12:00:00Z"));
  assert.equal(result.heatmap.length, 365);
  assert.equal(result.heatmap.find((day) => day.date === "2026-08-25")?.count, 2);
  assert.equal(result.activeDays, 1);
  assert.equal(result.numericFields[0].average, 3);
  assert.equal(result.numericFields[0].latest, 4);
});

test("builds a fixed-scale monthly Tracker calendar", () => {
  const month = trackerCalendarMonth([
    { date: "2026-08-25", count: 1 },
    { date: "2026-08-26", count: 5 },
  ], "2026-08", "2026-08-26");
  assert.equal(month.leadingDays, 5);
  assert.equal(month.activeDays, 2);
  assert.equal(month.totalRecords, 6);
  assert.equal(month.days[24].available, true);
  assert.equal(month.days[26].available, false);
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(trackerHeatLevel), [0, 1, 2, 3, 4, 4]);
  assert.equal(shiftTrackerMonth("2026-01", -1), "2025-12");
});
