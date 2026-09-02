import assert from "node:assert/strict";
import test from "node:test";
import { healthKitSupported, hostSupports, nativeNotificationIdentifier, nativeNotificationSchedule, nativeNotificationsSupported } from "./native-bridge.ts";
import type { ScheduledNotification } from "./types.ts";

test("native capabilities are detected from getInfo, never from user agent", () => {
  const oldHost = { platform: "ios", healthKitPipeline: "energy-v1" };
  assert.equal(healthKitSupported(oldHost), true);
  assert.equal(nativeNotificationsSupported(oldHost), false);
  assert.equal(hostSupports(oldHost, "notification.getStatus"), false);

  const nextHost = { platform: "ios", methods: [
    "notification.getStatus", "notification.requestAuthorization", "notification.schedule", "notification.cancel", "notification.listPending", "notification.openSettings",
  ] };
  assert.equal(nativeNotificationsSupported(nextHost), true);
});

test("partial notification bridges stay unavailable", () => {
  assert.equal(nativeNotificationsSupported({ capabilities: { "notification.getStatus": true } }), false);
});

const scheduled = {
  id: 42, title: "Medication", note: "After dinner", subjectLabel: "Momo", sourceLabel: "Cats",
  nextDueAt: "2099-09-10T09:00:00.000Z", scheduledAt: "2099-09-10T09:00:00.000Z", snoozedUntil: null,
  leadTimeMinutes: 60, dueHasExplicitTime: true, isActive: true,
} as ScheduledNotification;

test("native notification identifiers are stable across reminder edits", () => {
  assert.equal(nativeNotificationIdentifier(42), "evaorbit-reminder-42");
  assert.equal(nativeNotificationSchedule(scheduled)?.id, nativeNotificationSchedule({ ...scheduled, title: "Updated" })?.id);
});

test("native schedules reuse reminder timing rules and exclude date-only reminders", () => {
  assert.equal(nativeNotificationSchedule(scheduled)?.triggerAt, "2099-09-10T08:00:00.000Z");
  assert.equal(nativeNotificationSchedule({ ...scheduled, snoozedUntil: "2099-09-10T10:30:00.000Z" })?.triggerAt, "2099-09-10T10:30:00.000Z");
  assert.equal(nativeNotificationSchedule({ ...scheduled, dueHasExplicitTime: false }), null);
  assert.equal(nativeNotificationSchedule({ ...scheduled, isActive: false }), null);
});
