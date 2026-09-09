import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
  BACKUP_VERSION,
  EXCLUDED_BACKUP_TABLES,
  emptyBackupResources,
  normalizeBackupRowForSqlite,
  parseBackupDocument,
  sanitizeExportRow,
  toSqliteValue,
} from "./data-backup.ts";

test("backup allowlist excludes credentials and HealthKit energy infrastructure", () => {
  assert.ok(BACKUP_TABLES.includes("food_logs"));
  assert.ok(BACKUP_TABLES.includes("relation_event_flows"));
  assert.ok(BACKUP_TABLES.includes("lucius_post_comments"));
  assert.ok(BACKUP_TABLES.includes("memory_entities"));
  assert.ok(BACKUP_TABLES.includes("memory_facts"));
  assert.ok(BACKUP_TABLES.includes("memory_sources"));
  assert.ok(EXCLUDED_BACKUP_TABLES.includes("ai_providers"));
  assert.ok(EXCLUDED_BACKUP_TABLES.includes("push_subscriptions"));
  assert.ok(EXCLUDED_BACKUP_TABLES.includes("native_devices"));
  assert.ok(EXCLUDED_BACKUP_TABLES.includes("healthkit_daily_energy"));
});

test("export sanitation removes account identity and dangling provider references", () => {
  assert.deepEqual(sanitizeExportRow("food_logs", { id: 7, user_id: "private", title: "Lunch" }), { id: 7, title: "Lunch" });
  assert.deepEqual(sanitizeExportRow("chat_messages", { id: 8, user_id: "private", provider_id: 2, model_config_id: 3, content: "hello" }), {
    id: 8,
    provider_id: null,
    model_config_id: null,
    content: "hello",
  });
});

test("backup parser requires a complete current-version document", () => {
  const backup = {
    backup_version: BACKUP_VERSION,
    exported_at: "2026-09-05T08:00:00.000Z",
    schema: { supabase_migration: BACKUP_SCHEMA_VERSION },
    source: { backend: "supabase" },
    resources: emptyBackupResources(),
  };
  assert.deepEqual(parseBackupDocument(backup), backup);
  assert.throws(() => parseBackupDocument({ ...backup, backup_version: 4 }), /不支持/);
  const incomplete = { ...backup, resources: { ...backup.resources } };
  delete (incomplete.resources as Partial<typeof incomplete.resources>).projects;
  assert.throws(() => parseBackupDocument(incomplete), /备份不完整/);
});

test("backup version 1 restores missing Memory Graph resources as empty arrays", () => {
  const resources=emptyBackupResources() as Record<string,unknown>;
  delete resources.memory_entities;
  delete resources.memory_facts;
  delete resources.memory_sources;
  const parsed=parseBackupDocument({backup_version:1,exported_at:"2026-09-01T00:00:00Z",schema:{supabase_migration:"legacy"},source:{backend:"supabase"},resources});
  assert.deepEqual(parsed.resources.memory_entities,[]);
  assert.deepEqual(parsed.resources.memory_facts,[]);
  assert.deepEqual(parsed.resources.memory_sources,[]);
});

test("backup version 2 remains restorable before Weight resources existed", () => {
  const resources=emptyBackupResources() as Record<string,unknown>;
  delete resources.weight_records;
  delete resources.weight_settings;
  const parsed=parseBackupDocument({backup_version:2,exported_at:"2026-09-01T00:00:00Z",schema:{supabase_migration:"legacy-v2"},source:{backend:"supabase"},resources});
  assert.deepEqual(parsed.resources.weight_records,[]);
  assert.deepEqual(parsed.resources.weight_settings,[]);
});

test("SQLite conversion preserves scalars and serializes structured values", () => {
  assert.equal(toSqliteValue(true), 1);
  assert.equal(toSqliteValue(false), 0);
  assert.equal(toSqliteValue(null), null);
  assert.equal(toSqliteValue(["a", "b"]), '["a","b"]');
  assert.equal(toSqliteValue({ value: 3 }), '{"value":3}');
});

test("Postgres time values are compatible with the local minute-only reminder schema", () => {
  assert.equal(sanitizeExportRow("meal_reminder_rules", { remind_at: "10:30:00" }).remind_at, "10:30");
  assert.equal(normalizeBackupRowForSqlite("meal_reminder_rules", { remind_at: "20:15:00.000000" }).remind_at, "20:15");
  assert.equal(normalizeBackupRowForSqlite("meal_reminder_rules", { remind_at: "08:05" }).remind_at, "08:05");
  assert.equal(sanitizeExportRow("weight_settings", { reminder_time: "08:30:00" }).reminder_time, "08:30");
});
