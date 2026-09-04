import assert from "node:assert/strict";
import test from "node:test";
import { isReminderTime, mealReminderWindow } from "./meal-reminders.ts";

test("meal reminder times accept only a complete 24-hour time", () => {
  assert.equal(isReminderTime("10:00"), true);
  assert.equal(isReminderTime("20:45"), true);
  assert.equal(isReminderTime("24:00"), false);
  assert.equal(isReminderTime("9:00"), false);
});

test("meal reminder window opens at the configured time for two hours", () => {
  const rule = { remindAt: "10:00", enabled: true };
  assert.equal(mealReminderWindow(rule, "2026-09-05", new Date("2026-09-05T01:59:59.000Z")), null);
  assert.equal(mealReminderWindow(rule, "2026-09-05", new Date("2026-09-05T02:00:00.000Z"))?.scheduledAt, "2026-09-05T02:00:00.000Z");
  assert.equal(mealReminderWindow(rule, "2026-09-05", new Date("2026-09-05T03:59:59.000Z"))?.scheduledAt, "2026-09-05T02:00:00.000Z");
  assert.equal(mealReminderWindow(rule, "2026-09-05", new Date("2026-09-05T04:00:00.000Z")), null);
  assert.equal(mealReminderWindow({ ...rule, enabled: false }, "2026-09-05", new Date("2026-09-05T02:00:00.000Z")), null);
});
