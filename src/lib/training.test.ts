import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildHistorySuggestions } from "./history-suggestions.ts";
import { parseNewTrainingLog, parseTrainingLogPatch, ValidationError } from "./validation.ts";

test("validates a date-only Training Log and trims free suggestion fields", () => {
  const log = parseNewTrainingLog({ occurredAt: "2026-08-31T04:00:00.000Z", trainingType: "strength", bodyParts: ["背", "手臂", "背"], teacher: "  Eva  ", course: "  Pull day  ", durationMinutes: 55, notes: " ok " });
  assert.equal(log.occurredHasExplicitTime, false);
  assert.deepEqual(log.bodyParts, ["背", "手臂"]);
  assert.equal(log.teacher, "Eva");
  assert.equal(log.course, "Pull day");
  assert.throws(() => parseNewTrainingLog({ occurredAt: "2026-08-31T04:00:00.000Z", trainingType: "cardio", bodyParts: [] }), /至少选择一个/);
  assert.throws(() => parseNewTrainingLog({ occurredAt: "2026-08-31T04:00:00.000Z", trainingType: "cardio", bodyParts: ["腰"] }), ValidationError);
  assert.deepEqual(parseTrainingLogPatch({ teacher: "  New teacher  " }), { occurredAt: undefined, occurredHasExplicitTime: undefined, trainingType: undefined, bodyParts: undefined, teacher: "New teacher", course: undefined, durationMinutes: undefined, notes: undefined });
});

test("shared history suggestions rank frequency before recency and keep free casing", () => {
  const records = [
    { value: " Eva ", at: "2026-08-28T00:00:00Z" },
    { value: "Mia", at: "2026-08-30T00:00:00Z" },
    { value: "eva", at: "2026-08-31T00:00:00Z" },
  ];
  assert.deepEqual(buildHistorySuggestions(records, (item) => item.value, (item) => item.at), ["eva", "Mia"]);
});

test("Training migrations define independent owner-scoped storage for Supabase and SQLite", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/202608310002_training_logs.sql", import.meta.url), "utf8");
  const sqlite = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.training_logs/);
  assert.match(migration, /occurred_has_explicit_time boolean not null default false/);
  assert.match(migration, /body_parts jsonb/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /to authenticated/);
  assert.match(sqlite, /CREATE TABLE training_logs/);
  assert.match(sqlite, /INSERT INTO migrations\(version\) VALUES\(24\)/);
});

test("Health home defaults Energy Review to yesterday and exposes Training CRUD", () => {
  const page = readFileSync(new URL("../app/health/page.tsx", import.meta.url), "utf8");
  const collection = readFileSync(new URL("../app/api/health/training/route.ts", import.meta.url), "utf8");
  const item = readFileSync(new URL("../app/api/health/training/[id]/route.ts", import.meta.url), "utf8");
  assert.match(page, /shiftDate\(today, -1\)/);
  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function POST/);
  assert.match(item, /export async function PATCH/);
  assert.match(item, /export async function DELETE/);
});
