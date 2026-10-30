import assert from "node:assert/strict";
import test from "node:test";
import { associationContextRange, defaultTimelineAssociation, matchTimelineAssociations, parseTimelineAssociation, projectTimelineAssociations, readAssociationPages, type TimelineAssociationRule } from "./timeline-association.ts";
import { buildCalendarTimelineEvents } from "./calendar-timeline.ts";
import { buildTimelineEvents, summarizeTimelineDays } from "./timeline.ts";
import { dateRange } from "./time.ts";
import type { CalendarEvent, Tracker, TrackerEntry } from "./types.ts";

const tracker: Tracker = { id: 3, name: "Shower", icon: "", iconType: "default", iconValue: "", groupName: "", timeType: "point", quickCaptureEnabled: true, statsConfig: {}, createdAt: "", updatedAt: "" };
const calendar: CalendarEvent = { id: 4, title: "洗香香", startAt: "2026-10-30T00:12:00+08:00", endAt: "2026-10-30T00:43:00+08:00", notes: "calendar original", location: "home", timezone: "Asia/Shanghai", isAllDay: false, status: "confirmed", createdAt: "", updatedAt: "" };
const entry: TrackerEntry = { id: 5, trackerId: 3, occurredAt: "2026-10-29T16:43:00.000Z", endAt: null, values: { temperature: 38, happy: true }, note: "tracker original", createdAt: "", updatedAt: "" };
const rule: TimelineAssociationRule = { id: "shower", type: "calendar_tracker", name: "Shower", enabled: true, calendarTitle: "洗香香", titleMatch: "exact", trackerId: 3, timeMatch: "near_end", toleranceMinutes: 5 };
const settings = { ...defaultTimelineAssociation(), rules: [rule] };
const match = (calendars = [calendar], entries = [entry], rules = settings.rules, complete = true) => matchTimelineAssociations({ ...settings, rules }, calendars, entries, [tracker], complete);

test("end proximity merges a single activity and preserves complete original records without mutation", () => {
  const before = JSON.stringify({ calendar, entry, tracker, settings });
  const range = dateRange("2026-10-30"), events = [...buildCalendarTimelineEvents([calendar], range), ...buildTimelineEvents([], [], [entry], [tracker])];
  const result = projectTimelineAssociations(events, match(), range);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].association, { type: "calendar_tracker", ruleIds: ["shower"], calendar, entry, tracker });
  assert.equal(result[0].occurredAt, new Date(calendar.startAt).toISOString());
  assert.equal(JSON.stringify({ calendar, entry, tracker, settings }), before);
  assert.equal(match([calendar], [{ ...entry, occurredAt: "2026-10-30T00:48:00+08:00" }]).length, 1);
  assert.equal(match([calendar], [{ ...entry, occurredAt: "2026-10-30T00:48:00.001+08:00" }]).length, 0);
});

test("all competing pairs are rejected across rules, independent of input order; duplicate rules do not create competition", () => {
  const second = { ...entry, id: 6 };
  assert.equal(match([calendar], [entry, second]).length, 0);
  const otherCalendar = { ...calendar, id: 7 };
  assert.equal(match([calendar, otherCalendar]).length, 0);
  const alternate = { ...rule, id: "other", trackerId: 8 };
  assert.equal(matchTimelineAssociations({ ...settings, rules: [rule, alternate] }, [calendar], [entry, { ...second, trackerId: 8 }], [tracker, { ...tracker, id: 8 }], true).length, 0);
  assert.deepEqual(match([otherCalendar, calendar], [second, entry]), match([calendar, otherCalendar], [entry, second]));
  assert.deepEqual(match([calendar], [entry], [rule, { ...rule, id: "duplicate" }])[0].ruleIds, ["duplicate", "shower"]);
});

test("title matching is explicit, Unicode aware, object-ID based and respects disabling", () => {
  assert.equal(match([{ ...calendar, title: "洗香香 · home" }]).length, 0);
  assert.equal(match([{ ...calendar, title: "洗香香 · home" }], [entry], [{ ...rule, titleMatch: "prefix" }]).length, 1);
  assert.equal(match([calendar], [entry], [{ ...rule, enabled: false }]).length, 0);
  assert.equal(match([calendar], [{ ...entry, trackerId: 99 }]).length, 0);
  assert.equal(match([{ ...calendar, title: "☀️ Shower" }], [entry], [{ ...rule, calendarTitle: "☀ Shower" }]).length, 1);
});

test("all-day, tentative, cancelled, unknown-time and invalid or long intervals never merge", () => {
  for (const changed of [{ ...calendar, isAllDay: true }, { ...calendar, status: "tentative" as const }, { ...calendar, status: "cancelled" as const }, { ...calendar, startAt: calendar.endAt }, { ...calendar, endAt: "2026-10-30T08:00:00+08:00" }, { ...calendar, startAt: "2026-10-30" }]) assert.equal(match([changed]).length, 0);
  for (const changed of [{ ...entry, occurredAt: "2026-10-30" }, { ...entry, endAt: "bad" }, { ...entry, endAt: entry.occurredAt }, { ...entry, occurredHasExplicitTime: false }, { ...entry, occurredAt: "2026-10-29T00:00:00Z", endAt: entry.occurredAt }]) assert.equal(match([calendar], [changed]).length, 0);
  assert.equal(match([calendar], [entry], [rule], false).length, 0);
});

test("interval modes require the configured evidence rather than any temporal overlap", () => {
  const middle = { ...entry, occurredAt: "2026-10-30T00:20:00+08:00" };
  assert.equal(match([calendar], [middle]).length, 0);
  assert.equal(match([calendar], [middle], [{ ...rule, timeMatch: "within" }]).length, 1);
  const range = { ...entry, occurredAt: calendar.startAt, endAt: calendar.endAt };
  assert.equal(match([calendar], [range], [{ ...rule, timeMatch: "range" }]).length, 1);
  assert.equal(match([calendar], [entry], [{ ...rule, timeMatch: "range" }]).length, 0);
  const short = { ...calendar, startAt: "2026-10-30T00:40:00+08:00" };
  assert.equal(match([short], [{ ...entry, occurredAt: "2026-10-30T00:42:00+08:00", endAt: calendar.endAt }], [{ ...rule, timeMatch: "range" }]).length, 0);
});

test("cross-day/month projection is identical in daily and monthly views, retaining a midnight endpoint's original day", () => {
  const cross = { ...calendar, startAt: "2026-10-31T23:40:00+08:00", endAt: "2026-11-01T00:00:00+08:00" };
  const midnight = { ...entry, occurredAt: "2026-10-31T16:00:00.000Z" };
  const matches = match([cross], [midnight]);
  const month = { from: dateRange("2026-10-01").from, to: dateRange("2026-11-02").from };
  const all = projectTimelineAssociations([...buildCalendarTimelineEvents([cross], month), ...buildTimelineEvents([], [], [midnight], [tracker])], matches, month);
  const summaries = summarizeTimelineDays(all);
  for (const date of ["2026-10-31", "2026-11-01"]) {
    const range = dateRange(date), day = projectTimelineAssociations(buildCalendarTimelineEvents([cross], range), matches, range);
    assert.equal(day.length, 1); assert.equal(summaries[date].count, day.length);
    assert.deepEqual(day[0], all.find(event => event.metadata.timelineDate === date));
  }
  const context = associationContextRange(dateRange("2026-11-01"));
  assert.equal(context.from, dateRange("2026-10-30").from);
});

test("cursor reads continue past short pages and reject repeated cursors or a safety-limit truncation", async () => {
  const seen: number[] = [];
  const complete = await readAssociationPages(async after => { seen.push(after); return after < 3 ? [{ id: after + 1 }] : []; });
  assert.equal(complete.complete, true); assert.deepEqual(seen, [0, 1, 2, 3]);
  assert.equal((await readAssociationPages(async () => [{ id: 1 }])).complete, false);
  const truncated = await readAssociationPages(async after => Array.from({ length: 200 }, (_, i) => ({ id: after + i + 1 })));
  assert.equal(truncated.complete, false); assert.deepEqual(truncated.records, []);
});

test("configuration validation rejects malformed references, unsupported types, duplicate identities and bad revisions", () => {
  assert.deepEqual(parseTimelineAssociation(settings), settings);
  for (const value of [{ ...settings, schemaVersion: 2 }, { ...settings, revision: -1 }, { ...settings, revision: Number.MAX_SAFE_INTEGER }, { ...settings, rules: [rule, rule] }, ...[{ trackerId: 0 }, { type: "food" }, { enabled: "yes" }, { calendarTitle: " " }, { toleranceMinutes: 61 }, { toleranceMinutes: 1.5 }, { timeMatch: "any" }].map(change => ({ ...settings, rules: [{ ...rule, ...change }] }))]) assert.throws(() => parseTimelineAssociation(value));
});
