import assert from "node:assert/strict";
import test from "node:test";
import { reminderNotificationCopy } from "./notification-copy.ts";

test("scheduled reminders use a generic title and keep the event and due date in the body", () => {
  const copy = reminderNotificationCopy({
    title: "给 Momo 驱虫",
    sourceType: "cat_routine",
    nextDueAt: "2026-09-08T12:30:00.000Z",
    timezone: "Asia/Shanghai",
  }, "zh-CN", "web_push");
  assert.equal(copy.title, "Reminder");
  assert.match(copy.body, /^给 Momo 驱虫 · /);
  assert.match(copy.body, /20:30/);
});

test("missing Tracker reminders use Not Logged and explain what is absent", () => {
  assert.deepEqual(reminderNotificationCopy({
    title: "体重",
    sourceType: "tracker_missing",
    intervalValue: 3,
    nextDueAt: "2026-09-08T12:30:00.000Z",
  }, "zh-CN", "web_push"), { title: "Not Logged", body: "已3日未记录体重" });
});

test("meal and weight missing records use the same Not Logged title", () => {
  assert.deepEqual(reminderNotificationCopy({ title: "早餐", sourceType: "meal_missing" }, "zh-CN", "web_push"), {
    title: "Not Logged",
    body: "今日早餐还未记录",
  });
  assert.deepEqual(reminderNotificationCopy({ title: "体重", sourceType: "weight_missing" }, "zh-CN", "web_push"), {
    title: "Not Logged",
    body: "今日体重还未记录",
  });
});
