import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calendarCategoryIcon, defaultCalendarInterpretation, matchingCalendarRule, parseCalendarInterpretation, suggestedCalendarPrefix } from "./calendar-interpretation.ts";
import { summarizeCalendarActivity, homeActivitySentence } from "./home-day.ts";
import type { CalendarEvent } from "./types.ts";

const record: CalendarEvent = { id: 1, title: "📚 999h", notes: "🎮 只是评论", startAt: "2026-10-01T04:00:00.000Z", endAt: "2026-10-01T04:30:00.000Z", isAllDay: false, timezone: "Asia/Shanghai", location: "", status: "confirmed", createdAt: "", updatedAt: "" };

test("defaults preserve existing interpretations and match emoji presentation variants", () => {
  const settings = defaultCalendarInterpretation();
  assert.deepEqual(parseCalendarInterpretation(settings), settings);
  assert.equal(matchingCalendarRule(" 🎮️ game", settings)?.categoryId, "gaming");
  assert.equal(matchingCalendarRule("评论里 🎮", settings), null);
  settings.rules[3].enabled = false;
  assert.equal(matchingCalendarRule("🎮 game", settings), null);
  assert.equal(matchingCalendarRule("🎮 game", settings, true)?.id, "gaming");
  assert.equal(defaultCalendarInterpretation().rules[3].enabled, true);
});

test("custom categories combine multiple prefixes without parsing comments or title durations", () => {
  const settings = defaultCalendarInterpretation();
  settings.categories.push({ id: "reading", name: "阅读", kind: "activity" });
  settings.rules.push({ id: "books", prefix: "📚", categoryId: "reading", enabled: true, includeInSummary: true }, { id: "read", prefix: "读书", categoryId: "reading", enabled: true, includeInSummary: true });
  parseCalendarInterpretation(settings);
  const result = summarizeCalendarActivity([record, { ...record, id: 2, title: "读书", startAt: "2026-10-01T06:00:00.000Z", endAt: "2026-10-01T06:20:00.000Z" }], "2026-10-01", settings);
  const reading = result.activities.find(item => item.category === "reading")!;
  assert.equal(reading.durationMinutes, 50);
  assert.equal(result.activities.find(item => item.category === "gaming")?.durationMinutes, 0);
  assert.equal(homeActivitySentence([reading], false, true), "今天已记录50 分钟阅读。");
  assert.equal(result.activityRecords[0].notes, record.notes);
  settings.rules.find(item => item.id === "books")!.includeInSummary = false;
  assert.equal(matchingCalendarRule(record.title, settings)?.categoryId, "reading");
  assert.equal(summarizeCalendarActivity([record], "2026-10-01", settings).activities.find(item => item.category === "reading")?.durationMinutes, 0);
});

test("rule changes reinterpret historical sleep and activity records without changing original data", () => {
  const settings = defaultCalendarInterpretation(), original = JSON.stringify(record);
  settings.rules.push({ id: "custom-sleep", prefix: "📚", categoryId: "sleep", enabled: true, includeInSummary: false });
  assert.equal(summarizeCalendarActivity([record], "2026-10-01", settings).sleep?.durationMinutes, 30);
  settings.rules.at(-1)!.enabled = false;
  assert.equal(summarizeCalendarActivity([record], "2026-10-01", settings).sleep, null);
  assert.equal(JSON.stringify(record), original);
});

test("validation rejects ambiguous prefixes, broken references, duplicates and malformed toggles", () => {
  const settings = defaultCalendarInterpretation();
  for (const prefix of ["🎮️", "🎮 game"]) assert.throws(() => parseCalendarInterpretation({ ...settings, rules: [...settings.rules, { id: "conflict", prefix, categoryId: "gaming", enabled: true, includeInSummary: true }] }), /前缀冲突/);
  assert.throws(() => parseCalendarInterpretation({ ...settings, rules: [{ ...settings.rules[0], categoryId: "missing" }] }), /规则格式/);
  assert.throws(() => parseCalendarInterpretation({ ...settings, rules: [{ ...settings.rules[0], prefix: "️" }] }), /规则格式/);
  assert.throws(() => parseCalendarInterpretation({ ...settings, rules: [{ ...settings.rules[0], enabled: "false" }] }), /规则格式/);
  assert.throws(() => parseCalendarInterpretation({ ...settings, categories: [...settings.categories, settings.categories[0]] }), /分类重复/);
  assert.throws(() => parseCalendarInterpretation({ ...settings, revision: -1 }), /版本/);
});

test("quick definition suggests a complete emoji grapheme or a leading text token", () => {
  assert.equal(suggestedCalendarPrefix(" 👩‍💻 专注"), "👩‍💻");
  assert.equal(suggestedCalendarPrefix("📺️ 电影"), "📺️");
  assert.equal(suggestedCalendarPrefix("读书 30m"), "读书");
});

test("category icons preserve legacy defaults, support text fallback and follow shared classification", () => {
  const settings = defaultCalendarInterpretation();
  assert.equal(calendarCategoryIcon(settings.categories[1]), "Iphone");
  settings.categories[1].icon = null;
  assert.equal(calendarCategoryIcon(parseCalendarInterpretation(settings).categories[1]), null);
  settings.categories.push({ id: "reading", name: "阅读", kind: "activity", icon: "Book" });
  settings.rules.push({ id: "books", prefix: "📚", categoryId: "reading", enabled: true, includeInSummary: true }, { id: "read", prefix: "读书", categoryId: "reading", enabled: true, includeInSummary: true });
  const parsed = parseCalendarInterpretation(settings);
  const reading = summarizeCalendarActivity([record, { ...record, id: 2, title: "读书" }], "2026-10-01", parsed).activities.find(item => item.category === "reading")!;
  assert.equal(reading.icon, "Book");
  assert.equal(reading.durationMinutes, 60);
  for (const icon of ["../Iphone", "", 1, "<svg>"]) assert.throws(() => parseCalendarInterpretation({ ...settings, categories: [{ ...settings.categories[1], icon }] }), /图标/);
});

test("Postgres migration defaults equal SQLite defaults and safely add one owner-scoped preference column", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202610020005_calendar_interpretation.sql", import.meta.url), "utf8");
  assert.deepEqual(JSON.parse(sql.match(/default '(.*?)'::jsonb/)![1]), defaultCalendarInterpretation());
  assert.match(sql, /add column if not exists calendar_interpretation/);
  assert.doesNotMatch(sql, /drop table|delete from|disable row level security/i);
});
