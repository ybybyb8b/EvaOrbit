export const BACKUP_VERSION = 1 as const;
export const BACKUP_SCHEMA_VERSION = "202609050001_meal_reminders";

/**
 * Dependency-safe import order. This is deliberately an allowlist: adding a new
 * business table requires an explicit review before it can enter an export.
 */
export const BACKUP_TABLES = [
  "ui_preferences",
  "tasks",
  "memories",
  "chat_sessions",
  "chat_messages",
  "inbox_items",
  "food_library",
  "food_places",
  "food_dishes",
  "food_logs",
  "drink_logs",
  "drink_limits",
  "daily_nutrition_summaries",
  "trackers",
  "tracker_fields",
  "tracker_entries",
  "tracker_goals",
  "tracker_reminders",
  "pets",
  "cat_events",
  "cat_symptoms",
  "vet_visits",
  "cat_medications",
  "cat_measurements",
  "reminders",
  "cat_routines",
  "reminder_occurrences",
  "health_records",
  "training_logs",
  "media_series",
  "media_items",
  "media_viewings",
  "chronicle_entries",
  "memos",
  "lucius_diary_entries",
  "lucius_cases",
  "lucius_state",
  "lucius_posts",
  "projects",
  "project_items",
  "relation_people",
  "relation_events",
  "relation_event_parties",
  "relation_event_items",
  "relation_event_flows",
  "person_memory_notes",
  "notification_deliveries",
  "meal_reminder_rules",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;
export type BackupResources = Record<BackupTable, BackupRow[]>;

export const EXCLUDED_BACKUP_TABLES = [
  "ai_settings",
  "ai_providers",
  "ai_model_configs",
  "push_subscriptions",
  "native_devices",
  "healthkit_daily_energy",
  "migration_import_ledger",
] as const;

export interface EvaOrbitBackup {
  backup_version: typeof BACKUP_VERSION;
  exported_at: string;
  schema: {
    supabase_migration: string;
  };
  source: {
    backend: "supabase";
  };
  resources: BackupResources;
}

export function emptyBackupResources(): BackupResources {
  return Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])) as unknown as BackupResources;
}

export function sanitizeExportRow(table: BackupTable, source: BackupRow): BackupRow {
  const row = { ...source };
  delete row.user_id;
  // Provider/model records contain secrets and are intentionally excluded. Keep
  // conversation content useful locally without leaving dangling foreign keys.
  if (table === "chat_sessions" || table === "chat_messages") {
    row.provider_id = null;
    row.model_config_id = null;
  }
  return row;
}

export function toSqliteValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "string" || typeof value === "number") return value;
  return JSON.stringify(value);
}

export function parseBackupDocument(value: unknown): EvaOrbitBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("备份文件不是有效的 JSON 对象");
  const document = value as Record<string, unknown>;
  if (document.backup_version !== BACKUP_VERSION) {
    throw new Error(`不支持的 backup_version：${String(document.backup_version)}（当前仅支持 ${BACKUP_VERSION}）`);
  }
  if (typeof document.exported_at !== "string" || Number.isNaN(Date.parse(document.exported_at))) {
    throw new Error("备份文件缺少有效的 exported_at");
  }
  if (!document.schema || typeof document.schema !== "object" || typeof (document.schema as Record<string, unknown>).supabase_migration !== "string") {
    throw new Error("备份文件缺少 schema.supabase_migration");
  }
  if (!document.resources || typeof document.resources !== "object" || Array.isArray(document.resources)) {
    throw new Error("备份文件缺少 resources");
  }
  const resources = document.resources as Record<string, unknown>;
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(resources[table])) throw new Error(`备份不完整：resources.${table} 缺失或格式错误`);
    if (!(resources[table] as unknown[]).every((row) => row && typeof row === "object" && !Array.isArray(row))) {
      throw new Error(`备份格式错误：resources.${table} 必须只包含对象`);
    }
  }
  return value as EvaOrbitBackup;
}
