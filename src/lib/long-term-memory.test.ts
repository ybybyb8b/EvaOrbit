import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseLuciusDiaryPatch, parseLuciusPostCommentPatch, parseLuciusPostPatch, parseLuciusStatePatch, parseMemoPatch, parseNewLuciusDiaryEntry, parseNewLuciusPost, parseNewLuciusPostComment, parseNewMemo } from "./validation.ts";

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

test("Lucius state accepts only the two explicit presentation fields", () => {
  assert.deepEqual(parseLuciusStatePatch({ status: "reading", mood: "calm" }), { status: "reading", mood: "😌" });
  assert.equal(parseLuciusStatePatch({ mood: "有点珍惜" }).mood, "🥹");
  assert.equal(parseLuciusStatePatch({ mood: "🌙" }).mood, "🌙");
  assert.throws(() => parseLuciusStatePatch({ currentNote: "", status: "reading" }));
  assert.throws(() => parseLuciusStatePatch({}));
  assert.throws(() => parseLuciusStatePatch({ status: "" }));
  assert.throws(() => parseLuciusStatePatch({ mood: "puzzled today" }));
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

test("Lucius Post comments keep author attribution explicit", () => {
  const item = parseNewLuciusPostComment({ postId: 7, author: "lucius", content: "  I heard you.  " });
  assert.deepEqual(item, { postId: 7, author: "lucius", content: "I heard you." });
  assert.equal(parseLuciusPostCommentPatch({ content: "Still here." }).content, "Still here.");
  assert.throws(() => parseNewLuciusPostComment({ postId: 7, author: "other", content: "No." }));
  assert.throws(() => parseNewLuciusPostComment({ postId: 0, author: "user", content: "No." }));
  assert.throws(() => parseNewLuciusPostComment({ postId: 7, author: "user", content: "" }));
  assert.throws(() => parseNewLuciusPostComment({ postId: 7, author: "user", content: "x".repeat(2001) }));
  assert.throws(() => parseLuciusPostCommentPatch({}));
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
  const memoRoute = readFileSync(new URL("../app/api/memos/route.ts", import.meta.url), "utf8");
  const diaryRoute = readFileSync(new URL("../app/api/lucius/diary/route.ts", import.meta.url), "utf8");
  const stateRoute = readFileSync(new URL("../app/api/lucius/state/route.ts", import.meta.url), "utf8");
  const postsRoute = readFileSync(new URL("../app/api/lucius/posts/route.ts", import.meta.url), "utf8");
  const commentsRoute = readFileSync(new URL("../app/api/lucius/posts/[id]/comments/route.ts", import.meta.url), "utf8");
  const commentsUi = readFileSync(new URL("../app/lucius/lucius-post-comments.tsx", import.meta.url), "utf8");
  const luciusPage = readFileSync(new URL("../app/lucius/page.tsx", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../components/app-navigation.tsx", import.meta.url), "utf8");
  assert.match(shell, /<AppSidebar/);
  assert.match(shell, /<SpacesNavigation/);
  assert.match(navigation, /href: "\/memo"/);
  assert.match(navigation, /href: "\/lucius"/);
  assert.match(navigation, /href: "\/lucius", label: "Lucius"/);
  for (const route of [memoRoute, diaryRoute, postsRoute]) { assert.match(route, /export async function GET/); assert.match(route, /export async function POST/); }
  assert.match(commentsRoute, /export async function GET/);
  assert.match(commentsRoute, /export async function POST/);
  assert.match(commentsUi, /\/api\/lucius\/posts\/\$\{postId\}\/comments/);
  assert.match(stateRoute, /export async function GET/);
  assert.match(stateRoute, /export async function PATCH/);
  assert.match(luciusPage, /tab === "posts" \? listLuciusPosts/);
  assert.match(luciusPage, /tab === "diary" \? listLuciusDiaryEntries/);
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

test("Lucius Post comments migration is owner-scoped and follows its parent post", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202609060003_lucius_post_comments.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.lucius_post_comments/);
  assert.match(sql, /post_id bigint not null references public\.lucius_posts\(id\) on delete cascade/);
  assert.match(sql, /author text not null check \(author in \('user', 'lucius'\)\)/);
  assert.match(sql, /alter table public\.lucius_post_comments enable row level security/);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.match(sql, /grant update \(content\)/);
});
