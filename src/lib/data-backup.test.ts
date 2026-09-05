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

test("backup allowlist excludes credentials and HealthKit/device data", () => {
  assert.ok(BACKUP_TABLES.includes("food_logs"));
  assert.ok(BACKUP_TABLES.includes("relation_event_flows"));
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
  assert.equal(parseBackupDocument(backup), backup);
  assert.throws(() => parseBackupDocument({ ...backup, backup_version: 2 }), /不支持/);
  const incomplete = { ...backup, resources: { ...backup.resources } };
  delete (incomplete.resources as Partial<typeof incomplete.resources>).projects;
  assert.throws(() => parseBackupDocument(incomplete), /备份不完整/);
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
});
