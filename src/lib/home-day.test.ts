import assert from "node:assert/strict";
import test from "node:test";
import { classifyCalendarEvent, homeActivitySentence, homeMeals, summarizeCalendarActivity } from "./home-day.ts";
import type { CalendarEvent, TimelineEvent } from "./types.ts";

function event(id: number, title: string, startAt: string, endAt: string): CalendarEvent {
  return { id, title, notes: "这只是用户评论，不能作为标签", startAt, endAt, isAllDay: false, timezone: "Asia/Shanghai", location: "", status: "confirmed", createdAt: startAt, updatedAt: startAt };
}

test("Home Meals keeps regular meal order and interleaves each timed snack without changing Timeline", () => {
  function meal(id: number, mealType: string, time: string, hasExplicitTime = true): TimelineEvent {
    return { id: `food:${id}`, sourceId: id, eventType: "food.logged", sourceType: "food", title: `food ${id}`, detail: "dish detail", occurredAt: `2026-10-16T${time}:00+08:00`, hasExplicitTime, endAt: null, href: "/food", relatedPeople: [], relatedPets: [], metadata: { mealType } };
  }
  const input = [meal(4,"late_night","23:00"),meal(7,"snack","20:00"),meal(3,"dinner","18:00"),meal(6,"snack","15:00"),meal(2,"lunch","12:00"),meal(5,"snack","10:00"),meal(1,"breakfast","08:00"),meal(8,"snack","06:00"),meal(9,"snack","00:00",false)];
  const original = structuredClone(input);
  assert.deepEqual(homeMeals(input).map(item=>item.mealType),["snack","breakfast","snack","lunch","snack","dinner","snack","late_night","snack"]);
  assert.deepEqual(homeMeals(input).map(item=>item.detail),["food 8","food 1","food 5","food 2","food 6","food 3","food 7","food 4","food 9"]);
  assert.deepEqual(input,original);
  assert.deepEqual(homeMeals([meal(2,"lunch","06:00"),meal(1,"breakfast","14:00")]).map(item=>item.mealType),["breakfast","lunch"]);
  assert.deepEqual(homeMeals([meal(2,"lunch","00:00",false),meal(1,"breakfast","00:00",false)]).map(item=>item.mealType),["breakfast","lunch"]);
  assert.deepEqual(homeMeals([meal(6,"snack","15:00"),meal(5,"snack","10:00")]).map(item=>item.title),["food 5","food 6"]);
  assert.deepEqual(homeMeals([]),[]);
});

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
  assert.deepEqual(result.sleep?.records.map(record => record.id), [1, 2]);
  assert.equal(result.sleep?.records[0].notes, "这只是用户评论，不能作为标签");
  assert.equal(result.sleep?.records[0].startAt, "2026-09-30T15:30:00.000Z");
  assert.equal(result.activities.find((item) => item.category === "phone")?.durationMinutes, 60);
  assert.equal(result.activities.find((item) => item.category === "screen")?.durationMinutes, 90);
  const phone = result.activityRecords.find((item) => item.category === "phone")!;
  assert.equal(phone.startAt, "2026-09-30T16:00:00.000Z");
  assert.equal(phone.durationMinutes, 60);
  assert.equal(phone.notes, "这只是用户评论，不能作为标签");
});

test("activity prose only mentions recorded categories and distinguishes today from history", () => {
  const activities = [{ category: "phone" as const, durationMinutes: 80 }, { category: "screen" as const, durationMinutes: 0 }, { category: "gaming" as const, durationMinutes: 30 }];
  assert.equal(homeActivitySentence([], false, true), null);
  assert.equal(homeActivitySentence([{ category: "phone", durationMinutes: 0 }], false, true), null);
  assert.equal(homeActivitySentence(activities, false, true), "今天已记录1 小时 20 分手机使用和30 分钟游戏。");
  assert.match(homeActivitySentence(activities, false, false)!, /^这一天，记录了/);
  assert.equal(homeActivitySentence([{ category: "screen", durationMinutes: 45 }], true, true), "Recorded so far today: 45m of TV and movies.");
});

test("activity breakdown excludes unmatched, all-day and cancelled Calendar events", () => {
  const events = [event(1, "🎮", "2026-10-01T15:30:00.000Z", "2026-10-01T16:30:00.000Z"), event(2, "无标签", "2026-10-01T05:00:00.000Z", "2026-10-01T06:00:00.000Z"), { ...event(3, "🍠", "2026-10-01T05:00:00.000Z", "2026-10-01T06:00:00.000Z"), isAllDay: true }, { ...event(4, "📺", "2026-10-01T05:00:00.000Z", "2026-10-01T06:00:00.000Z"), status: "cancelled" as const }];
  const result = summarizeCalendarActivity(events, "2026-10-01");
  assert.equal(result.activityRecords.length, 1);
  assert.equal(result.activityRecords[0].durationMinutes, 30);
  assert.equal(result.activityRecords[0].endAt, "2026-10-01T16:00:00.000Z");
});
