import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarTimelineEvents, calendarTimelineQuery, calendarTimelineRangeLabel, readCalendarTimelineRecords } from "./calendar-timeline.ts";
import { compareTimelineEvents, summarizeTimelineDays } from "./timeline.ts";
import { dateRange } from "./time.ts";
import type { CalendarEvent } from "./types.ts";

const overnight: CalendarEvent = { id: 1, title: "😴 8h", notes: "原始评论\n不解读标签", startAt: "2026-09-30T15:00:00.000Z", endAt: "2026-09-30T23:00:00.000Z", isAllDay: false, timezone: "Asia/Shanghai", location: "卧室", status: "confirmed", createdAt: "", updatedAt: "" };

test("Calendar timeline keeps true intervals and original content across days and month boundaries", () => {
  const events = buildCalendarTimelineEvents([overnight], { from: dateRange("2026-09-30").from, to: dateRange("2026-10-01").to });
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.metadata.timelineDate), ["2026-09-30", "2026-10-01"]);
  for (const event of events) {
    assert.equal(event.title, overnight.title);
    assert.equal(event.occurredAt, overnight.startAt);
    assert.equal(event.endAt, overnight.endAt);
    assert.equal(event.metadata.notes, overnight.notes);
    assert.equal(event.hasExplicitTime, true);
  }
  assert.equal(calendarTimelineRangeLabel(events[1], false, "2026-10-01"), "前一日 23:00 → 07:00");
  assert.equal(calendarTimelineRangeLabel(events[0], true, "2026-09-30"), "23:00 → Next day 07:00");
  assert.equal(calendarTimelineRangeLabel(events[1], false), "2026-09-30 23:00 → 2026-10-01 07:00");
  assert.deepEqual(Object.keys(summarizeTimelineDays(events)), ["2026-09-30", "2026-10-01"]);
  assert.equal([...events].sort(compareTimelineEvents)[0].metadata.timelineDate, "2026-10-01");
});

test("Calendar timeline includes unclassified and tentative events, excludes cancelled, and never fuzzy-deduplicates titles", () => {
  const items = [
    { ...overnight, title: "散步", status: "tentative" as const },
    { ...overnight, id: 2, title: "散步" },
    { ...overnight, id: 3, status: "cancelled" as const },
  ];
  const events = buildCalendarTimelineEvents(items, dateRange("2026-10-01"));
  assert.equal(events.length, 2);
  assert.equal(events[0].metadata.status, "tentative");
  assert.notEqual(events[0].id, events[1].id);
});

test("all-day Calendar events preserve date-only boundaries and exclude their end date", () => {
  const record = { ...overnight, isAllDay: true, startAt: "2026-09-30", endAt: "2026-10-02" };
  const events = buildCalendarTimelineEvents([record], { from: dateRange("2026-09-30").from, to: dateRange("2026-10-02").to });
  assert.deepEqual(events.map(event => event.metadata.timelineDate), ["2026-09-30", "2026-10-01"]);
  assert.equal(events[0].hasExplicitTime, false);
  assert.equal(events[0].metadata.startAt, "2026-09-30");
  assert.equal(calendarTimelineRangeLabel(events[0], false), "全天 · 2026-09-30 → 2026-10-01");
  assert.equal(buildCalendarTimelineEvents([record], dateRange("2026-10-02")).length, 0);
});

test("Calendar midnight endpoints are exclusive and invalid timed intervals do not render", () => {
  const events = buildCalendarTimelineEvents([
    { ...overnight, endAt: dateRange("2026-10-01").from },
    { ...overnight, id: 2, startAt: dateRange("2026-10-02").from, endAt: dateRange("2026-10-02").to },
    { ...overnight, id: 3, endAt: overnight.startAt },
    { ...overnight, id: 4, startAt: "invalid" },
  ], dateRange("2026-10-01"));
  assert.equal(events.length, 0);
});

test("Calendar range query covers mixed all-day dates and UTC timed boundaries", () => {
  const range = dateRange("2026-10-01"), query = calendarTimelineQuery(range);
  assert.equal(query.from, "2026-09-30");
  assert.equal(query.to, range.to);
  assert.equal(query.from < overnight.endAt, true);
  assert.equal(query.from < "2026-10-02", true);
});

test("Calendar offset timestamps sort by actual time alongside UTC EO records", () => {
  const records = [{ ...overnight, startAt: "2026-10-01T04:00:00+08:00", endAt: "2026-10-01T04:30:00+08:00" }, { ...overnight, id: 2, startAt: "2026-10-01T04:00:00.000Z", endAt: "2026-10-01T05:00:00.000Z" }];
  const events = buildCalendarTimelineEvents(records, dateRange("2026-10-01")).sort(compareTimelineEvents);
  assert.equal(events[0].sourceId, 2);
  assert.equal(events[1].occurredAt, "2026-09-30T20:00:00.000Z");
  assert.equal(events[1].metadata.startAt, records[0].startAt);
});

test("busy Calendar ranges fall back to daily reads and deduplicate cross-day records", async () => {
  const records = Array.from({ length: 501 }, (_, index) => ({ ...overnight, id: index + 1 }));
  let calls = 0;
  const result = await readCalendarTimelineRecords({ from: dateRange("2026-09-30").from, to: dateRange("2026-10-01").to }, async () => {
    calls += 1;
    return calls === 1 ? records.slice(0, 500) : calls === 2 ? records.slice(0, 300) : records.slice(200);
  });
  assert.equal(calls, 3);
  assert.equal(result.length, 501);
  let dailyCalls = 0;
  await readCalendarTimelineRecords(dateRange("2026-10-01"), async () => { dailyCalls += 1; return records.slice(0, 500); });
  assert.equal(dailyCalls, 1);
});
