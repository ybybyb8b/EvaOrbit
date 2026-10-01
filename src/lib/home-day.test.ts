import assert from "node:assert/strict";
import test from "node:test";
import { classifyCalendarEvent, summarizeCalendarActivity } from "./home-day.ts";
import type { CalendarEvent } from "./types.ts";

function event(id: number, title: string, startAt: string, endAt: string): CalendarEvent {
  return { id, title, notes: "这只是用户评论，不能作为标签", startAt, endAt, isAllDay: false, timezone: "Asia/Shanghai", location: "", status: "confirmed", createdAt: startAt, updatedAt: startAt };
}

test("calendar activity classification only uses title prefixes", () => {
  assert.equal(classifyCalendarEvent("🍠 2h"), "phone");
  assert.equal(classifyCalendarEvent(" 📺 一部电影"), "screen");
  assert.equal(classifyCalendarEvent("🎮 游戏"), "gaming");
  assert.equal(classifyCalendarEvent("散步 🍠"), null);
});

test("calendar activity uses event intervals, clips totals, and separates main sleep from naps", () => {
  const result = summarizeCalendarActivity([
    event(1, "😴 8h", "2026-09-30T15:30:00.000Z", "2026-09-30T23:30:00.000Z"),
    event(2, "😴 午睡", "2026-10-01T05:00:00.000Z", "2026-10-01T05:40:00.000Z"),
    event(3, "🍠 标题中的时长不可信", "2026-09-30T15:00:00.000Z", "2026-09-30T17:00:00.000Z"),
    event(4, "📺", "2026-10-01T12:00:00.000Z", "2026-10-01T13:30:00.000Z"),
  ], "2026-10-01");
  assert.equal(result.sleep?.durationMinutes, 480);
  assert.equal(result.sleep?.napCount, 1);
  assert.equal(result.sleep?.napMinutes, 40);
  assert.equal(result.activities.find((item) => item.category === "phone")?.durationMinutes, 60);
  assert.equal(result.activities.find((item) => item.category === "screen")?.durationMinutes, 90);
});
