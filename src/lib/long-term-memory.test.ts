import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMemoPatch, parseNewMemo } from "./validation.ts";

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
