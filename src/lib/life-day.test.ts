import assert from "node:assert/strict";
import test from "node:test";
import { lifeDayDate, recurrenceCompletionDate } from "./life-day.ts";
import { catRoutineCompletionPatch, notificationShouldSend, reminderActionPatch } from "./reminder-engine.ts";
import type { Reminder } from "./types.ts";

const zone = "Asia/Shanghai";
const routine = { intervalValue: 1, intervalUnit: "day" as const, recurrenceMode: "completion" as const, anchorDate: "2026-10-12", nextDueDate: "2026-10-12", configuredReminderTime: "23:00", timezone: zone };
const monday = "2026-10-12T15:00:00.000Z";
const tuesday = "2026-10-13T15:00:00.000Z";
const late = new Date("2026-10-12T17:00:00.000Z");

test("Monday 23:00 completed Tuesday 01:00 leaves Tuesday 23:00 due in either recurrence mode", () => {
  for (const recurrenceMode of ["completion", "fixed"] as const) {
    const result = catRoutineCompletionPatch({ ...routine, recurrenceMode }, late);
    assert.equal(result.nextDueAt, tuesday);
    assert.equal(result.lastCompletedAt, late.toISOString());
    assert.equal(result.anchorDate, "2026-10-12");
    assert.equal(notificationShouldSend({ nextDueAt: result.nextDueAt, snoozedUntil: null, leadTimeMinutes: 0, lastNotifiedAt: null, dueHasExplicitTime: true, timezone: zone, repeatWhileOverdue: false }, new Date(tuesday)), true);
  }
});

test("main sleep wake overrides fallback in both directions; naps do not reset a day", () => {
  const early = [{ startAt: "2026-10-12T13:00:00Z", endAt: "2026-10-12T20:00:00Z", durationMinutes: 420 }];
  assert.equal(lifeDayDate(new Date("2026-10-12T20:00:00Z"), zone, "06:00", early), "2026-10-13");
  const lateSleep = [{ startAt: "2026-10-13T00:00:00Z", endAt: "2026-10-13T07:00:00Z", durationMinutes: 420 }];
  assert.equal(lifeDayDate(new Date("2026-10-12T23:00:00Z"), zone, "06:00", lateSleep), "2026-10-12");
  assert.equal(lifeDayDate(new Date("2026-10-13T07:00:00Z"), zone, "06:00", lateSleep), "2026-10-13");
  assert.equal(lifeDayDate(new Date("2026-10-13T05:00:00Z"), zone, "06:00", [...early, { startAt: "2026-10-13T06:00:00Z", endAt: "2026-10-13T06:30:00Z", durationMinutes: 30 }]), "2026-10-13");
});

test("missing sleep uses editable local cutoff with exact boundary and month/year rollover", () => {
  const at = new Date("2026-12-31T21:00:00Z");
  assert.equal(lifeDayDate(at, zone, "06:00"), "2026-12-31");
  assert.equal(lifeDayDate(at, zone, "05:00"), "2027-01-01");
  assert.equal(lifeDayDate(new Date("2026-03-08T09:59:00Z"), "America/New_York", "06:00"), "2026-03-07");
  assert.equal(lifeDayDate(new Date("2026-03-08T10:00:00Z"), "America/New_York", "06:00"), "2026-03-08");
});

test("after-midnight due times retain their civil date offset", () => {
  const completionDate = recurrenceCompletionDate(late, "2026-10-12T17:00:00Z", zone);
  assert.equal(completionDate, "2026-10-13");
  assert.equal(catRoutineCompletionPatch({ ...routine, nextDueDate: "2026-10-13", configuredReminderTime: "01:00" }, late, completionDate).nextDueAt, "2026-10-13T17:00:00.000Z");
});

test("calendar intervals keep the configured time; snooze does not re-anchor an occurrence; hourly intervals keep elapsed-time semantics", () => {
  const reminder = { scheduleType: "interval", intervalValue: 1, intervalUnit: "day", timezone: zone, nextDueAt: monday, startsAt: monday, snoozedUntil: late.toISOString(), endsAt: null } as Reminder;
  assert.equal(reminderActionPatch(reminder, "complete", late).nextDueAt, tuesday);
  assert.equal(reminderActionPatch(reminder, "skip", late).nextDueAt, tuesday);
  assert.equal(reminderActionPatch({ ...reminder, intervalUnit: "hour", intervalValue: 8 }, "complete", late).nextDueAt, "2026-10-13T01:00:00.000Z");
});
