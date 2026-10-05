import assert from "node:assert/strict";
import test from "node:test";
import { actualSleepSessions, buildDailySleepSummary, sleepDisplay, type SleepSample } from "./sleep.ts";
import { enabledHealthKitReadMetrics, parseHealthKitReadChanges } from "./healthkit-read.ts";
import { parseHealthKitUpload } from "./healthkit.ts";
import type { HomeSleepSummary } from "./home-day.ts";

const sample = (id: string, startAt: string, endAt: string, stage = 3, sourceBundle = "watch"): SleepSample => ({ sampleId: id, startAt, endAt, stage, timeZone: "Asia/Shanghai", timeZoneSource: "metadata", sourceBundle, sourceName: sourceBundle });
const window: HomeSleepSummary = { startAt: "2026-10-04T15:00:00Z", endAt: "2026-10-04T23:00:00Z", durationMinutes: 480, napCount: 0, napMinutes: 0, records: [{ id: 1, title: "Sleep", startAt: "2026-10-04T15:00:00Z", endAt: "2026-10-04T23:00:00Z", durationMinutes: 480, notes: "" }] };
const night = [
  sample("bed", "2026-10-04T15:00:00Z", "2026-10-04T23:00:00Z", 0),
  sample("pre-midnight", "2026-10-04T15:30:00Z", "2026-10-04T17:30:00Z", 3),
  sample("wake", "2026-10-04T17:30:00Z", "2026-10-04T18:00:00Z", 2),
  sample("deep", "2026-10-04T18:00:00Z", "2026-10-04T20:00:00Z", 4),
  sample("rem", "2026-10-04T20:00:00Z", "2026-10-04T23:00:00Z", 5),
];

test("all night stages belong to wake date; Actual Sleep excludes Awake/In Bed and compares against window", () => {
  const result = buildDailySleepSummary("2026-10-05", night, window);
  assert.equal(result.actual?.durationMinutes, 420);
  assert.equal(result.actual?.startAt, "2026-10-04T15:30:00.000Z");
  assert.equal(result.actual?.endAt, "2026-10-04T23:00:00.000Z");
  assert.equal(result.windowMinusActualMinutes, 60);
  assert.equal(result.efficiency, .875);
  assert.equal(sleepDisplay(result)?.source, "apple_health");
  assert.equal(sleepDisplay(result)?.durationMinutes, 420);
  assert.equal(buildDailySleepSummary("2026-10-04", night, null).actual, null);
});

test("duplicate stages, overlapping intervals and broad legacy source never double-count sleep", () => {
  const result = buildDailySleepSummary("2026-10-05", [...night, ...night,
    sample("overlap", "2026-10-04T19:00:00Z", "2026-10-04T21:00:00Z", 3),
    sample("legacy", "2026-10-04T15:00:00Z", "2026-10-04T23:00:00Z", 1, "manual"),
  ], window);
  assert.equal(result.actual?.durationMinutes, 420);
  assert.equal(result.actual?.sourceBundle, "watch");
});

test("legacy unspecified asleep subtracts overlapping awake without treating missing time as asleep", () => {
  const result = actualSleepSessions([
    sample("old", "2026-10-04T15:00:00Z", "2026-10-04T23:00:00Z", 1),
    sample("awake", "2026-10-04T18:00:00Z", "2026-10-04T18:30:00Z", 2),
  ]);
  assert.equal(result[0].durationMinutes, 450);
});

test("without usable asleep samples Home falls back to timeline estimate, never actual or efficiency", () => {
  for (const samples of [[], [night[0]], [night[2]], [sample("unknown", window.startAt, window.endAt, 99)]]) {
    const result = buildDailySleepSummary("2026-10-05", samples, window);
    assert.equal(result.actual, null);
    assert.equal(result.source, "timeline_estimate");
    assert.equal(sleepDisplay(result)?.durationMinutes, 480);
    assert.equal(result.efficiency, null);
    assert.equal(result.windowMinusActualMinutes, null);
  }
  assert.equal(sleepDisplay(buildDailySleepSummary("2026-10-05", [], null)), null);
});

test("separate naps do not inflate main sleep, mismatched windows aren't compared, raw efficiency isn't capped", () => {
  const naps = [...night, sample("nap", "2026-10-05T05:00:00Z", "2026-10-05T06:00:00Z", 1)];
  const result = buildDailySleepSummary("2026-10-05", naps, window);
  assert.equal(result.actual?.durationMinutes, 420);
  assert.equal(result.napMinutes, 60);
  const wrongWindow = { ...window, startAt: "2026-10-05T02:00:00Z", endAt: "2026-10-05T03:00:00Z", durationMinutes: 60, records: [] };
  assert.equal(buildDailySleepSummary("2026-10-05", night, wrongWindow).efficiency, null);
  const shortWindow = { ...window, durationMinutes: 300, records: [] };
  assert.equal(buildDailySleepSummary("2026-10-05", night, shortWindow).efficiency, 1.4);
});

test("wake date follows preserved sample zone including DST rather than UTC or current device zone", () => {
  const rows = [ { ...sample("dst", "2026-11-01T03:00:00Z", "2026-11-01T13:00:00Z", 1), timeZone: "America/New_York" } ];
  assert.equal(buildDailySleepSummary("2026-11-01", rows, null).actual?.durationMinutes, 600);
  const west = [{ ...sample("west", "2026-10-05T02:00:00Z", "2026-10-05T06:00:00Z", 1), timeZone: "America/Los_Angeles" }];
  assert.equal(buildDailySleepSummary("2026-10-04", west, null).actual?.durationMinutes, 240);
  assert.equal(buildDailySleepSummary("2026-10-05", west, null).actual, null);
});

test("read payload preserves sleep category/zone/source and heart quantities but default sync enables only sleep", () => {
  const base = { operation: "upsert", sampleId: "946e6cf1-96f2-4e47-9d45-b0fab32db24d", streamId: "946e6cf1-96f2-4e47-9d45-b0fab32db24e", revision: 1, metric: "sleep", startAt: window.startAt, endAt: window.endAt, timeZone: "Asia/Shanghai", timeZoneSource: "metadata", stage: 5, sourceName: "Watch", syncIdentifier: "source.1", syncVersion: 2 };
  const upload = parseHealthKitUpload({ readChanges: [base] });
  assert.equal(upload.readChanges[0].stage, 5);
  assert.equal(upload.readChanges[0].syncVersion, 2);
  assert.deepEqual(enabledHealthKitReadMetrics(""), ["sleep"]);
  assert.deepEqual(enabledHealthKitReadMetrics("sleep,heart_rate,resting_heart_rate,hrv"), ["sleep", "heart_rate", "resting_heart_rate", "hrv"]);
  assert.equal(parseHealthKitReadChanges([{ ...base, metric: "hrv", stage: undefined, value: 42, unit: "ms" }])[0].value, 42);
  assert.throws(() => parseHealthKitReadChanges([{ ...base, timeZone: "invalid" }]));
  assert.throws(() => parseHealthKitReadChanges([{ ...base, endAt: "2026-10-04T14:00:00Z" }]));
  assert.throws(() => parseHealthKitReadChanges([{ ...base, metric: "hrv", value: 42, unit: "count/min" }]));
  assert.throws(() => parseHealthKitReadChanges([{ ...base, revision: 0 }]));
  assert.throws(() => parseHealthKitReadChanges([{ ...base, startAt: "2026-10-04T15:00:00" }]));
  assert.deepEqual(parseHealthKitReadChanges([{ operation: "delete", metric: "sleep", sampleId: base.sampleId, streamId: base.streamId, revision: 2 }])[0], { operation: "delete", metric: "sleep", sampleId: base.sampleId, streamId: base.streamId, revision: 2 });
});
