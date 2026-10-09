import assert from "node:assert/strict";
import test from "node:test";
import { calendarMealType, combineMealTimeline, resolveMealTimes, usualMeal } from "./meal-calendar.ts";
import { defaultCalendarInterpretation } from "./calendar-interpretation.ts";
import { buildCalendarTimelineEvents } from "./calendar-timeline.ts";
import { buildTimelineEvents, groupMealTimelineEvents } from "./timeline.ts";
import { dateRange } from "./time.ts";
import { parseNewFoodLog } from "./validation.ts";
import type { CalendarEvent, FoodLog } from "./types.ts";

const settings = defaultCalendarInterpretation();
test("Food form recommendations share Calendar meal boundaries without assigning a timestamp", () => {
  for (const [hour, meal] of [[0, "late_night"], [3, "late_night"], [4, "breakfast"], [10, "breakfast"], [11, "lunch"], [15, "lunch"], [16, "dinner"], [21, "dinner"], [22, "late_night"], [23, "late_night"]] as const) assert.equal(usualMeal(hour), meal);
});
const food: FoodLog = { ...parseNewFoodLog({ title: "咖喱鸡饭", mealType: "lunch", occurredAt: "2026-10-06T12:30:00+08:00" }), id: 1, createdAt: "", updatedAt: "" };
const window: CalendarEvent = { id: 9, title: "🍚吃饭饭", startAt: "2026-10-06T12:09:00+08:00", endAt: "2026-10-06T12:26:00+08:00", notes: "原日历评论", isAllDay: false, status: "confirmed", location: "", timezone: "Asia/Shanghai", createdAt: "", updatedAt: "" };

test("delayed Food entries use the real meal interval and merge Timeline without rewriting sources", () => {
  const original = JSON.stringify(food);
  const foods = resolveMealTimes([food, { ...food, id: 2, title: "汤" }], [window], settings);
  assert.equal(foods[0].occurredAt, window.startAt);
  assert.equal(foods[0].originalOccurredAt, food.occurredAt);
  assert.equal(JSON.stringify(food), original);
  const events = groupMealTimelineEvents(combineMealTimeline([...buildTimelineEvents(foods, []), ...buildCalendarTimelineEvents([window], dateRange("2026-10-06"))]));
  assert.equal(events.length, 1);
  assert.equal(events[0].endAt, window.endAt);
  assert.equal(events[0].metadata.count, 2);
  assert.ok("calendarEvent" in events[0].metadata);
});

test("standalone, manual, ambiguous, distant and non-meal records retain their original precision", () => {
  assert.deepEqual(resolveMealTimes([food], [], settings), [food]);
  for (const changed of [{ ...window, status: "cancelled" as const }, { ...window, status: "tentative" as const }, { ...window, title: "午餐计划" }, { ...window, isAllDay: true }]) assert.deepEqual(resolveMealTimes([food], [changed], settings), [food]);
  const manual = { ...food, calendarTimeEnabled: false };
  assert.deepEqual(resolveMealTimes([manual], [window], settings), [manual]);
  const late = { ...food, occurredAt: "2026-10-06T20:00:00+08:00" };
  assert.deepEqual(resolveMealTimes([late], [window], settings), [late]);
  assert.deepEqual(resolveMealTimes([food], [window, { ...window, id: 10, startAt: "2026-10-06T12:00:00+08:00" }], settings), [food]);
  const dateOnly = { ...food, occurredAt: "2026-10-06T12:00:00+08:00", occurredHasExplicitTime: false };
  assert.equal(resolveMealTimes([dateOnly], [window], settings)[0].calendarMeal?.id, window.id);
  assert.equal(resolveMealTimes([dateOnly], [window], settings)[0].originalHasExplicitTime, false);
});

test("custom rules take precedence, one window cannot supply two different meals, and matches update or fall back", () => {
  const rules = { ...settings, rules: [...settings.rules, { id: "meal", prefix: "🥢", categoryId: "phone", enabled: true, includeInSummary: false, mealType: "lunch" as const }] };
  assert.equal(calendarMealType({ ...window, title: "🥢任意自定义标题" }, rules), "lunch");
  rules.rules.at(-1)!.enabled = false;
  assert.equal(calendarMealType({ ...window, title: "🥢任意自定义标题" }, rules), null);
  const competing = resolveMealTimes([food, { ...food, id: 2, mealType: "snack" }], [window], settings);
  assert.ok(competing[0].calendarMeal);
  assert.equal(competing[1].calendarMeal, undefined);
  assert.equal(resolveMealTimes([food], [{ ...window, startAt: "2026-10-06T12:10:00+08:00" }], settings)[0].occurredAt, "2026-10-06T12:10:00+08:00");
  assert.equal(resolveMealTimes([food], [], settings)[0].occurredAt, food.occurredAt);
});
