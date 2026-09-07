import assert from "node:assert/strict";
import test from "node:test";
import { reminderNotificationCopy } from "./notification-copy.ts";

test("scheduled reminders use the event as title and its due date and time as body", () => {
  const copy = reminderNotificationCopy({
    title: "给 Momo 驱虫",
    sourceType: "cat_routine",
    nextDueAt: "2026-09-08T12:30:00.000Z",
    timezone: "Asia/Shanghai",
  });
  assert.equal(copy.title, "给 Momo 驱虫");
  assert.match(copy.body, /^到期：/);
  assert.match(copy.body, /20:30/);
});

test("missing Tracker reminders explain how long the record has been absent", () => {
  assert.deepEqual(reminderNotificationCopy({
    title: "体重",
    sourceType: "tracker_missing",
    intervalValue: 3,
    nextDueAt: "2026-09-08T12:30:00.000Z",
  }), { title: "体重", body: "已 3 日未记录" });
});
