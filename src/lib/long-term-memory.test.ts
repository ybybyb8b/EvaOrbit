import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseLuciusCasePatch, parseLuciusDiaryPatch, parseLuciusPostPatch, parseLuciusStatePatch, parseMemoPatch, parseNewLuciusCase, parseNewLuciusDiaryEntry, parseNewLuciusPost, parseNewMemo } from "./validation.ts";

test("Memo validation keeps long-term fields, unique tags and PATCH semantics", () => {
  const item = parseNewMemo({ title: "  姓名规则  ", content: "始终使用正确称呼", type: "basic", tags: ["人物", "人物", "规则"], eventDate: "2026-08-29", confirmedAt: "2026-08-29T08:00:00+08:00" });
  assert.equal(item.title, "姓名规则");
  assert.equal(item.status, "active");
  assert.deepEqual(item.tags, ["人物", "规则"]);
  assert.equal(item.sourceSystem, null);
  assert.equal(parseMemoPatch({ status: "archived" }).status, "archived");
  assert.throws(() => parseMemoPatch({}));
  assert.throws(() => parseNewMemo({ title: "X", content: "Y", type: "unknown" }));
});

test("Lucius Diary validates date-only content, free tags and nullable trace fields", () => {
  const entry = parseNewLuciusDiaryEntry({ date: "2026-08-29", content: "今天修正了一次误解。", tags: ["修正", "成长"], sourceSystem: "legacy" });
  assert.deepEqual(entry.tags, ["修正", "成长"]);
  assert.equal(entry.sourceSystem, "legacy");
  assert.equal(parseLuciusDiaryPatch({ tags: [] }).tags?.length, 0);
  assert.throws(() => parseNewLuciusDiaryEntry({ date: "2026-02-30", content: "invalid" }));
});

test("Lucius Cases preserves the complete correction record and validates counters", () => {
  const item = parseNewLuciusCase({ title: "称呼复发", errorType: "naming", severity: "habitual", status: "serving", triggerScenes: ["长对话"], errorQuote: "错误称呼", cause: "没有读取长期规则", correctBehavior: "先读取并使用正确称呼", mandatoryRule: "不得猜测称呼", punishment: "重新检查", firstOccurredDate: "2026-08-01", latestOccurredDate: "2026-08-29", occurrenceCount: 3, consecutiveCorrectCount: 0, recurrenceIntervalDays: 14, isRecurrence: true, resetThreshold: 5, nextCheck: "2026-09-05" });
  assert.equal(item.errorType, "naming");
  assert.equal(item.occurrenceCount, 3);
  assert.equal(item.isRecurrence, true);
  assert.equal(item.recurrenceIntervalDays, 14);
  assert.equal(parseLuciusCasePatch({ isRecurrence: false }).isRecurrence, false);
  assert.throws(() => parseNewLuciusCase({ title: "bad", errorType: "other", cause: "x", correctBehavior: "y", mandatoryRule: "z", firstOccurredDate: "2026-08-29", latestOccurredDate: "2026-08-01" }));
  assert.throws(() => parseLuciusCasePatch({ occurrenceCount: 0 }));
});

test("Lucius state accepts only the three explicit presentation fields", () => {
  assert.deepEqual(parseLuciusStatePatch({ currentNote: "  Return before dusk.  ", status: "reading", mood: "calm" }), { currentNote: "Return before dusk.", status: "reading", mood: "calm" });
  assert.equal(parseLuciusStatePatch({ currentNote: "" }).currentNote, "");
  assert.throws(() => parseLuciusStatePatch({}));
  assert.throws(() => parseLuciusStatePatch({ status: "" }));
});

test("Lucius Posts remain a minimal short-text timeline", () => {
  const item = parseNewLuciusPost({ content: "  安静地观察一会儿。  ", publishedAt: "2026-09-02T00:06:00+08:00" });
  assert.equal(item.content, "安静地观察一会儿。");
  assert.equal(item.publishedAt, "2026-09-01T16:06:00.000Z");
  assert.equal(parseLuciusPostPatch({ content: "Still here." }).content, "Still here.");
  assert.throws(() => parseNewLuciusPost({ content: "" }));
  assert.throws(() => parseNewLuciusPost({ content: "x".repeat(1001) }));
  assert.throws(() => parseLuciusPostPatch({}));
});

test("migration adds three independent owner-scoped models without touching Chronicle", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202608290004_memo_lucius.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.memos/);
  assert.match(sql, /create table if not exists public\.lucius_diary_entries/);
  assert.match(sql, /create table if not exists public\.lucius_cases/);
  assert.match(sql, /source_system text[\s\S]*source_id text[\s\S]*source_url text[\s\S]*imported_at timestamptz/);
  assert.match(sql, /alter table public\.memos enable row level security/);
  assert.match(sql, /alter table public\.lucius_diary_entries enable row level security/);
  assert.match(sql, /alter table public\.lucius_cases enable row level security/);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.doesNotMatch(sql, /alter table public\.chronicle_entries/i);
  assert.doesNotMatch(sql, /grant all|service_role/i);
});

test("navigation and route surfaces expose Memo plus the Lucius container", () => {
  const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
  const destinations = readFileSync(new URL("../app/home-destinations.tsx", import.meta.url), "utf8");
  const memoRoute = readFileSync(new URL("../app/api/memos/route.ts", import.meta.url), "utf8");
  const diaryRoute = readFileSync(new URL("../app/api/lucius/diary/route.ts", import.meta.url), "utf8");
  const casesRoute = readFileSync(new URL("../app/api/lucius/cases/route.ts", import.meta.url), "utf8");
  const stateRoute = readFileSync(new URL("../app/api/lucius/state/route.ts", import.meta.url), "utf8");
  const postsRoute = readFileSync(new URL("../app/api/lucius/posts/route.ts", import.meta.url), "utf8");
  const luciusPage = readFileSync(new URL("../app/lucius/page.tsx", import.meta.url), "utf8");
  assert.match(shell, /href: "\/memo"/);
  assert.match(shell, /href: "\/lucius"/);
  assert.match(shell, /<Link href="\/lucius"[\s\S]*?<span>Lucius<\/span><\/Link>/);
  assert.match(destinations, /href: "\/memo"/);
  assert.match(destinations, /href: "\/lucius"/);
  for (const route of [memoRoute, diaryRoute, casesRoute, postsRoute]) { assert.match(route, /export async function GET/); assert.match(route, /export async function POST/); }
  assert.match(stateRoute, /export async function GET/);
  assert.match(stateRoute, /export async function PATCH/);
  assert.match(luciusPage, /tab === "posts" \? listLuciusPosts/);
  assert.match(luciusPage, /tab === "diary" \? listLuciusDiaryEntries/);
  assert.match(luciusPage, /tab === "cases" \? listLuciusCases/);
});

test("Lucius state migration is a minimal owner-scoped singleton", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202609010002_lucius_state.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.lucius_state/);
  assert.match(sql, /user_id uuid primary key/);
  assert.match(sql, /current_note text[\s\S]*status text[\s\S]*mood text[\s\S]*updated_at timestamptz/);
  assert.match(sql, /alter table public\.lucius_state enable row level security/);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.match(sql, /grant update \(current_note, status, mood\)/);
  assert.doesNotMatch(sql, /affection|relationship|history|timeline/i);
});

test("Lucius Posts migration is owner-scoped and intentionally lightweight", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202609020001_lucius_posts.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.lucius_posts/);
  assert.match(sql, /content text not null check/);
  assert.match(sql, /published_at timestamptz not null/);
  assert.match(sql, /alter table public\.lucius_posts enable row level security/);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.match(sql, /grant update \(content, published_at\)/);
  assert.doesNotMatch(sql, /image|video|like|comment|repost|hashtag/i);
});
