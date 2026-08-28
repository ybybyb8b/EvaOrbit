import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHealthRecordPatch, parseNewHealthRecord, ValidationError } from "./validation.ts";

test("validates Health record defaults, details and time ordering", () => {
  const record = parseNewHealthRecord({ title: "过敏性鼻炎", type: "condition", details: { severity: "mild", active: true, count: 2, note: null } });
  assert.equal(record.status, "active");
  assert.equal(record.summary, "");
  assert.equal(record.startedAt, null);
  assert.deepEqual(record.details, { severity: "mild", active: true, count: 2, note: null });
  assert.throws(() => parseNewHealthRecord({ title: "不合法", type: "note", startedAt: "2026-08-28T10:00:00+08:00", endedAt: "2026-08-28T09:00:00+08:00" }), /结束时间不能早于开始时间/);
  assert.throws(() => parseNewHealthRecord({ title: "不合法", type: "note", details: { nested: { value: true } } }), ValidationError);
  assert.throws(() => parseNewHealthRecord({ title: "缺少类型" }), /健康记录类型不能为空/);
});

test("Health PATCH keeps omitted fields absent and supports clearing details", () => {
  assert.deepEqual(parseHealthRecordPatch({ status: "resolved" }), { status: "resolved", occurredAt: undefined, type: undefined, title: undefined, summary: undefined, startedAt: undefined, endedAt: undefined, details: undefined });
  assert.deepEqual(parseHealthRecordPatch({ details: {} }).details, {});
  assert.throws(() => parseHealthRecordPatch({}), /没有可更新/);
});

test("Health migration defines ownership, RLS, grants and time constraint", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202608280002_health_records.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.health_records/);
  assert.match(sql, /user_id uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /started_at is null or ended_at is null or ended_at >= started_at/i);
  assert.match(sql, /alter table public\.health_records enable row level security/);
  assert.match(sql, /for select to authenticated/);
  assert.match(sql, /for insert to authenticated/);
  assert.match(sql, /for update to authenticated/);
  assert.match(sql, /for delete to authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.health_records to authenticated/);
  assert.match(sql, /grant usage, select on sequence public\.health_records_id_seq to authenticated/);
  assert.doesNotMatch(sql, /grant all/i);
  assert.doesNotMatch(sql, /to service_role/i);
});

test("Health API and navigation expose the requested record surfaces", () => {
  const collectionRoute = readFileSync(new URL("../app/api/health/records/route.ts", import.meta.url), "utf8");
  const detailRoute = readFileSync(new URL("../app/api/health/records/[id]/route.ts", import.meta.url), "utf8");
  const homeModules = readFileSync(new URL("./home-modules.ts", import.meta.url), "utf8");
  const destinations = readFileSync(new URL("../app/home-destinations.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
  assert.match(collectionRoute, /export async function GET/);
  assert.match(collectionRoute, /export async function POST/);
  assert.match(collectionRoute, /parseNewHealthRecord/);
  assert.match(collectionRoute, /optionalTimestamp/);
  assert.match(detailRoute, /export async function GET/);
  assert.match(detailRoute, /export async function PATCH/);
  assert.match(detailRoute, /export async function DELETE/);
  assert.match(detailRoute, /parseHealthRecordPatch/);
  assert.match(homeModules, /"health"/);
  assert.match(destinations, /href: "\/health"/);
  assert.match(shell, /href: "\/health"/);
});
