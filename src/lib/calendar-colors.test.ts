import assert from "node:assert/strict";
import test from "node:test";
import { calendarColor, calendarColorInk, colorCalendarRecords, timelineCalendarColor } from "./calendar-colors.ts";
import { buildCalendarTimelineEvents } from "./calendar-timeline.ts";
import { dateRange } from "./time.ts";
import { captureEventKitPreferences, parseEventKitPreferences, resolveEventKitPreferences } from "./eventkit-preferences.ts";
import type { CalendarEvent } from "./types.ts";
import type { EventKitStatus } from "./eventkit-sync.ts";

const event: CalendarEvent = { id: 1, title: "Sleep", startAt: "2026-11-25T01:00:00+08:00", endAt: "2026-11-25T08:00:00+08:00", notes: "", isAllDay: false, timezone: "Asia/Shanghai", location: "", status: "confirmed", createdAt: "", updatedAt: "" };
const source = { identifier: "sleep", sourceIdentifier: "cloud", sourceTitle: "iCloud", title: "Sleep", allowsContentModifications: true, color: "#FFAA33" };
const status: EventKitStatus = { available: true, installationId: "fixture", calendarPermission: "full_access", reminderPermission: "full_access", calendars: [source], reminderLists: [] };

test("calendar colors follow the latest account binding, prefer overrides and reach ordinary and merged Timeline entries", () => {
  const sources = [{ ...source, colorOverride: "#668675" }];
  const bindings = [
    { id: 1, eo_id: 1, calendar_identifier: "old", source_identifier: "cloud", last_synced_at: "2026-11-24" },
    { id: 2, eo_id: 1, calendar_identifier: "sleep", source_identifier: "cloud", last_synced_at: "2026-11-25" },
  ];
  const records = colorCalendarRecords([event], bindings, sources);
  assert.equal(records[0].calendarSource?.color, "#668675");
  assert.equal(colorCalendarRecords([event], bindings, [source])[0].calendarSource?.color, "#ffaa33");
  assert.equal(colorCalendarRecords([event], bindings, [source, source])[0], event);
  assert.equal(colorCalendarRecords([event], [], sources)[0], event);
  assert.equal(event.calendarSource, undefined);
  const [entry] = buildCalendarTimelineEvents(records, dateRange("2026-11-25"));
  assert.equal(timelineCalendarColor(entry), "#668675");
  assert.equal(timelineCalendarColor({ ...entry, sourceType: "food", metadata: { calendarEvent: entry } }), "#668675");
  for (const invalid of ["red", "#fff", "url(secret)", "#000000;background:red"]) assert.equal(calendarColor(invalid), undefined);
});

test("source color preferences survive unrelated saves, old Hosts, reinstalls and unavailable calendars", () => {
  const preferences = captureEventKitPreferences(status, { sleep: "import" }, {});
  preferences.sources[0].colorOverride = "#a07886";
  const oldHost = { ...status, calendars: [{ ...source, color: undefined }] };
  const saved = captureEventKitPreferences(oldHost, { sleep: "off" }, {}, preferences, ["sleep"]);
  assert.equal(saved.sources[0].colorOverride, "#a07886");
  assert.equal(saved.sources[0].color, "#ffaa33");
  const reinstalled = { ...status, calendars: [{ ...source, identifier: "new-sleep" }] };
  assert.equal(resolveEventKitPreferences(preferences, reinstalled).colors?.["new-sleep"], "#a07886");
  assert.equal(captureEventKitPreferences(reinstalled, { "new-sleep": "import" }, {}, preferences).sources[0].colorOverride, "#a07886");
  assert.equal(captureEventKitPreferences({ ...status, calendars: [] }, {}, {}, preferences).sources[0].colorOverride, "#a07886");
  assert.throws(() => parseEventKitPreferences({ ...preferences, sources: [{ ...preferences.sources[0], colorOverride: "bad" }] }));
});

test("extreme source colors remain valid and visible across Vintage light and dark surfaces", () => {
  assert.notEqual(calendarColorInk("#ffffff", false), "#ffffff");
  assert.notEqual(calendarColorInk("#000000", true), "#000000");
  assert.equal(calendarColorInk("#668675", false), "#668675");
  for (const color of ["#ffffff", "#000000", "#ffeeaa", "#123456"]) {
    assert(calendarColor(calendarColorInk(color, false)));
    assert(calendarColor(calendarColorInk(color, true)));
  }
});
