import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTrackerTimeRange, trackerDurationMinutes, formatTrackerTimeRange } from "./tracker-time-range.ts";

test("time ranges derive duration from explicit instants, including midnight and offset changes", () => {
  const range = normalizeTrackerTimeRange({startAt:"2026-10-05T23:30:00+08:00",endAt:"2026-10-06T01:00:00+08:00",durationMinutes:999});
  assert.equal(range.durationMinutes,90);
  assert.equal(range.startAt,"2026-10-05T15:30:00.000Z");
  assert.ok(formatTrackerTimeRange(range).endsWith(" · 1h30m"));
  assert.equal(trackerDurationMinutes({startAt:"2026-11-01T01:30:00-04:00",endAt:"2026-11-01T01:30:00-05:00"}),60);
});

test("time range display uses compact days, hours and minutes in either language", () => {
  const startAt = "2026-10-01T00:00:00+08:00";
  for (const [minutes, expected] of [
    [30, "30m"], [60, "1h"], [90, "1h30m"], [1440, "1d"],
    [1470, "1d30m"], [10230, "7d2h30m"], [0.5, "0.5m"],
    [59.999, "1h"], [1439.999, "1d"],
  ] as const) {
    const range = { startAt, endAt: new Date(Date.parse(startAt) + minutes * 60000).toISOString() };
    for (const english of [false, true]) {
      assert.ok(formatTrackerTimeRange(range, english).endsWith(` · ${expected}`));
    }
    assert.equal(trackerDurationMinutes(range), minutes);
  }
  assert.equal(formatTrackerTimeRange(null), "");
});

test("time ranges reject incomplete, ambiguous, impossible, equal and reversed times", () => {
  for(const range of [null,{}, {startAt:"2026-10-05",endAt:"2026-10-06"}, {startAt:"2026-10-05T12:00",endAt:"2026-10-05T13:00"}, {startAt:"2026-02-30T12:00:00Z",endAt:"2026-03-03T12:00:00Z"}, {startAt:"2026-10-05T24:00:00Z",endAt:"2026-10-06T01:00:00Z"}, {startAt:"2026-10-05T12:00:00Z",endAt:"2026-10-05T12:00:00Z"}, {startAt:"2026-10-05T13:00:00Z",endAt:"2026-10-05T12:00:00Z"}]) {
    assert.throws(()=>normalizeTrackerTimeRange(range));
    assert.equal(trackerDurationMinutes(range),null);
  }
});
