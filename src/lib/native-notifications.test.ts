import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildNativeNotificationSchedules, isManagedNativeNotification, MANAGED_NATIVE_NOTIFICATION_PREFIX, nativeReminderNotification, nativeReminderNotifications } from "./native-notifications.ts";
import type { ScheduledNotification } from "./types.ts";

function reminder(sourceType: string | null, id = 42): ScheduledNotification {
  return { id, title: "Reminder", note: "", sourceType, subjectLabel: "", sourceLabel: "", nextDueAt: "2099-09-05T03:00:00.000Z", scheduledAt: "2099-09-05T03:00:00.000Z", snoozedUntil: null, leadTimeMinutes: 0, dueHasExplicitTime: true, isActive: true, timezone: "Asia/Shanghai", repeatWhileOverdue: false } as ScheduledNotification;
}

test("web and native host share the managed notification identifier contract", () => {
  const swift = readFileSync(new URL("../../ios/EvaOrbitHost/Sources/NotificationManager.swift", import.meta.url), "utf8");
  assert.match(swift, new RegExp(`scheduledIdentifierPrefix\\s*=\\s*"${MANAGED_NATIVE_NOTIFICATION_PREFIX}"`));
  assert.equal(isManagedNativeNotification("evaorbit-reminder-42"), true);
  assert.equal(isManagedNativeNotification("evaorbit-test-1"), false);
});

test("native schedules only deterministic Reminder sources", () => {
  const now = new Date("2099-09-05T01:00:00.000Z");
  const result = buildNativeNotificationSchedules({ upcoming: [reminder(null, 1), reminder("cat_routine", 2), reminder("tracker_standard", 3), reminder("tracker_missing", 4), reminder("period_medication", 5), reminder("task_due", 6),reminder("task_reminder",7)], now });
  assert.deepEqual(result.map((item) => item.id), ["evaorbit-scheduled-reminder-1", "evaorbit-scheduled-reminder-2", "evaorbit-scheduled-reminder-3", "evaorbit-scheduled-reminder-6","evaorbit-scheduled-reminder-7"]);
  assert.equal(nativeReminderNotification(reminder("tracker_missing"), "zh-CN", now), null);
  assert.equal(nativeReminderNotification(reminder("period_medication"), "zh-CN", now), null);
});

test("native reminders stage daily follow-ups after the due date", () => {
  const item = { ...reminder("cat_routine"), nextDueAt: "2026-09-05T01:00:00.000Z", repeatWhileOverdue: true };
  const result = nativeReminderNotifications(item, "zh-CN", new Date("2026-09-05T02:00:00.000Z"), 3);
  assert.deepEqual(result.map((entry) => entry.id), ["evaorbit-scheduled-reminder-42-2026-09-06", "evaorbit-scheduled-reminder-42-2026-09-07"]);
  assert.deepEqual(result.map((entry) => entry.triggerAt), ["2026-09-06T01:00:00.000Z", "2026-09-07T01:00:00.000Z"]);
});

test("native overdue follow-ups are opt-in", () => {
  assert.deepEqual(nativeReminderNotifications({ ...reminder(null), nextDueAt: "2026-09-05T01:00:00.000Z" }, "zh-CN", new Date("2026-09-05T02:00:00.000Z"), 3), []);
});

test("native Task follow-ups start only after the independent Due boundary",()=>{
  const item={...reminder("task_reminder"),nextDueAt:"2026-09-20T07:00:00.000Z",overdueAfter:"2026-09-21T10:00:00.000Z",repeatWhileOverdue:true};
  const result=nativeReminderNotifications(item,"zh-CN",new Date("2026-09-20T08:00:00.000Z"),4);
  assert.deepEqual(result.map(entry=>entry.triggerAt),["2026-09-22T07:00:00.000Z","2026-09-23T07:00:00.000Z"]);
});
