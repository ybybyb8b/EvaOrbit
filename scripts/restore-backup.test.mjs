import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES, BACKUP_VERSION, emptyBackupResources } from "../src/lib/data-backup.ts";

test("restore command targets only an explicit development SQLite and keeps IDs/FKs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-backup-test-"));
  try {
    const databasePath = path.join(directory, "development.db");
    const backupPath = path.join(directory, "backup.json");
    const schemaDatabase = new DatabaseSync(databasePath);
    for (const table of BACKUP_TABLES) {
      if (table === "projects") schemaDatabase.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT, created_at TEXT, updated_at TEXT)");
      else if (table === "project_items") schemaDatabase.exec("CREATE TABLE project_items (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, type TEXT, status TEXT, created_at TEXT, updated_at TEXT)");
      else if (table === "meal_reminder_rules") schemaDatabase.exec("CREATE TABLE meal_reminder_rules (meal_type TEXT PRIMARY KEY, remind_at TEXT NOT NULL CHECK(remind_at GLOB '[0-2][0-9]:[0-5][0-9]'), enabled INTEGER NOT NULL, updated_at TEXT)");
      else schemaDatabase.exec(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY)`);
    }
    schemaDatabase.close();
    const resources = emptyBackupResources();
    resources.projects.push({ id: 42, name: "真实长度项目", description: "用于界面调试", status: "active", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-05T00:00:00Z" });
    resources.project_items.push({ id: 84, project_id: 42, title: "保留关联关系", type: "ui", status: "doing", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-05T00:00:00Z" });
    resources.meal_reminder_rules.push({ meal_type: "breakfast", remind_at: "10:00:00", enabled: true, updated_at: "2026-09-05T00:00:00Z" });
    fs.writeFileSync(backupPath, JSON.stringify({
      backup_version: BACKUP_VERSION,
      exported_at: "2026-09-05T08:00:00.000Z",
      schema: { supabase_migration: BACKUP_SCHEMA_VERSION },
      source: { backend: "supabase" },
      resources,
    }));

    const result = spawnSync(process.execPath, ["scripts/restore-backup.mjs", backupPath], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const database = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual({ ...database.prepare("SELECT id,name FROM projects").get() }, { id: 42, name: "真实长度项目" });
    assert.deepEqual({ ...database.prepare("SELECT id,project_id FROM project_items").get() }, { id: 84, project_id: 42 });
    assert.equal(database.prepare("SELECT remind_at FROM meal_reminder_rules WHERE meal_type='breakfast'").get().remind_at, "10:00");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    database.close();
  } finally {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch (error) {
      if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
    }
  }
});

test("restore command refuses a non-SQLite target before opening the backup", () => {
  const result = spawnSync(process.execPath, ["scripts/restore-backup.mjs", "missing.json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "supabase", VERCEL: "" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be explicitly set to sqlite/);
});
