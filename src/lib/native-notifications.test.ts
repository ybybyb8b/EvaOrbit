import assert from "node:assert/strict";
import test from "node:test";
import { buildNativeNotificationSchedules, isManagedNativeNotification, nativeMealNotifications } from "./native-notifications.ts";
import type { MealReminderRule, ScheduledNotification } from "./types.ts";

const rules = [
  { mealType: "breakfast", remindAt: "10:00", enabled: true, updatedAt: "" },
  { mealType: "lunch", remindAt: "14:00", enabled: true, updatedAt: "" },
  { mealType: "dinner", remindAt: "20:00", enabled: false, updatedAt: "" },
] satisfies MealReminderRule[];

test("native meal schedules skip past, disabled, and already-recorded meals", () => {
  const now = new Date("2026-09-05T01:00:00.000Z");
  const result = nativeMealNotifications(rules, [{ occurredAt: "2026-09-05T04:00:00.000Z", mealType: "lunch" }], "zh-CN", now, 2);
  assert.deepEqual(result.map((item) => item.id), [
    "evaorbit-scheduled-meal-breakfast-2026-09-05",
    "evaorbit-scheduled-meal-breakfast-2026-09-06",
    "evaorbit-scheduled-meal-lunch-2026-09-06",
  ]);
  assert.equal(result[0].triggerAt, "2026-09-05T02:00:00.000Z");
});

test("one native schedule aggregates reminder and meal producers", () => {
  const reminder = { id: 42, title: "Medication", note: "", sourceType: "cat_routine", subjectLabel: "Momo", sourceLabel: "Cats", nextDueAt: "2026-09-05T03:00:00.000Z", scheduledAt: "2026-09-05T03:00:00.000Z", snoozedUntil: null, leadTimeMinutes: 0, dueHasExplicitTime: true, isActive: true } as ScheduledNotification;
  const result = buildNativeNotificationSchedules({ upcoming: [reminder], mealRules: rules.slice(0, 1), foodLogs: [], now: new Date("2026-09-05T01:00:00.000Z") });
  assert.deepEqual(result.slice(0, 2).map((item) => item.id), ["evaorbit-scheduled-meal-breakfast-2026-09-05", "evaorbit-scheduled-reminder-42"]);
  assert.equal(result.every((item) => isManagedNativeNotification(item.id)), true);
  assert.equal(isManagedNativeNotification("evaorbit-test-1"), false);
  assert.equal(isManagedNativeNotification("evaorbit-reminder-42"), true);
});
