import assert from "node:assert/strict";
import test from "node:test";
import { healthKitSupported, hostSupports, nativeHapticsSupported, nativeNotificationIdentifier, nativeNotificationSchedule, nativeNotificationsSupported, reconcileNativeNotifications } from "./native-bridge.ts";
import type { ScheduledNotification } from "./types.ts";

test("native capabilities are detected from getInfo, never from user agent", () => {
  const oldHost = { platform: "ios", healthKitPipeline: "energy-v1" };
  assert.equal(healthKitSupported(oldHost), true);
  assert.equal(nativeNotificationsSupported(oldHost), false);
  assert.equal(nativeHapticsSupported(oldHost), false);
  assert.equal(hostSupports(oldHost, "notification.getStatus"), false);

  const nextHost = { platform: "ios", methods: [
    "notification.getStatus", "notification.requestAuthorization", "notification.schedule", "notification.cancel", "notification.listPending", "notification.openSettings",
  ] };
  assert.equal(nativeNotificationsSupported(nextHost), true);
  assert.equal(nativeHapticsSupported({ platform: "ios", methods: ["haptic.play"] }), true);
});

test("notification triggers merge into one in-flight run and one follow-up", async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  let reads = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const methods = ["notification.getStatus", "notification.requestAuthorization", "notification.schedule", "notification.cancel", "notification.listPending", "notification.openSettings"];
  globalThis.window = { EvaOrbitNative: { version: 1, call: async (method: string) => ({ ok: true, result: method === "host.getInfo" ? { methods } : method === "notification.getStatus" ? { permission: "authorized" } : [] }) } } as unknown as Window & typeof globalThis;
  globalThis.fetch = async () => { reads++; if (reads === 1) await gate; return Response.json({ nativeNotifications: [] }); };
  try {
    const first = reconcileNativeNotifications();
    await new Promise(resolve => setImmediate(resolve));
    const rest = Array.from({ length: 10 }, () => reconcileNativeNotifications());
    assert.ok(rest.every(work => work === first));
    release(); await Promise.all([first, ...rest]);
    assert.equal(reads, 2, "events during an active read retain one fresh reconciliation");
    await reconcileNativeNotifications(); assert.equal(reads, 3);
  } finally { release(); globalThis.window = oldWindow; globalThis.fetch = oldFetch; }
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
  assert.equal(nativeNotificationIdentifier(42), "evaorbit-scheduled-reminder-42");
  assert.equal(nativeNotificationSchedule(scheduled)?.id, nativeNotificationSchedule({ ...scheduled, title: "Updated" })?.id);
});

test("native schedules reuse reminder timing rules and exclude date-only reminders", () => {
  assert.equal(nativeNotificationSchedule(scheduled)?.triggerAt, "2099-09-10T08:00:00.000Z");
  assert.equal(nativeNotificationSchedule(scheduled)?.title, "Medication");
  assert.match(nativeNotificationSchedule(scheduled)?.body ?? "", /^到期：/);
  assert.equal(nativeNotificationSchedule({ ...scheduled, snoozedUntil: "2099-09-10T10:30:00.000Z" })?.triggerAt, "2099-09-10T10:30:00.000Z");
  assert.equal(nativeNotificationSchedule({ ...scheduled, dueHasExplicitTime: false }), null);
  assert.equal(nativeNotificationSchedule({ ...scheduled, isActive: false }), null);
});
