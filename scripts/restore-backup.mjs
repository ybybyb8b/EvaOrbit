import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { BACKUP_TABLES, parseBackupDocument, toSqliteValue } from "../src/lib/data-backup.ts";

function fail(message) {
  console.error(`Restore refused: ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production" || process.env.VERCEL) fail("production/hosted environments are never valid restore targets");
if (process.env.EVAORBIT_DATA_BACKEND?.trim().toLowerCase() !== "sqlite") {
  fail("EVAORBIT_DATA_BACKEND must be explicitly set to sqlite");
}

const input = process.argv[2];
if (!input) fail("usage: npm run data:restore -- <backup-file>");
const backupPath = path.resolve(input);
if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) fail(`backup file not found: ${backupPath}`);

let backup;
try {
  backup = parseBackupDocument(JSON.parse(fs.readFileSync(backupPath, "utf8")));
} catch (error) {
  fail(error instanceof Error ? error.message : "invalid backup file");
}

const legacyDatabasePath = path.join(process.cwd(), "data", "personal-hub.db");
const defaultDatabasePath = fs.existsSync(legacyDatabasePath) ? legacyDatabasePath : path.join(process.cwd(), "data", "eva-orbit.db");
const resolvedDatabasePath = process.env.EVAORBIT_SQLITE_PATH
  ? path.resolve(process.env.EVAORBIT_SQLITE_PATH)
  : process.env.PERSONAL_HUB_DB_PATH
    ? path.resolve(process.env.PERSONAL_HUB_DB_PATH)
    : defaultDatabasePath;
if (resolvedDatabasePath === backupPath) fail("backup file and SQLite target must be different files");

if (!fs.existsSync(resolvedDatabasePath)) fail(`SQLite target does not exist: ${resolvedDatabasePath}. Run npm run dev once to initialize it.`);
const database = new DatabaseSync(resolvedDatabasePath);
database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
const existingTables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
const missingTables = BACKUP_TABLES.filter((table) => !existingTables.has(table));
if (missingTables.length) {
  database.close();
  fail(`SQLite schema is not current; missing tables: ${missingTables.join(", ")}. Run npm run dev once to apply local schema migrations.`);
}

const counts = {};
database.exec("BEGIN IMMEDIATE");
try {
  database.exec("PRAGMA defer_foreign_keys = ON");
  for (const table of [...BACKUP_TABLES].reverse()) database.exec(`DELETE FROM "${table}"`);
  for (const table of BACKUP_TABLES) {
    const availableColumns = new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name));
    let inserted = 0;
    for (const sourceRow of backup.resources[table]) {
      const columns = Object.keys(sourceRow).filter((column) => column !== "user_id" && availableColumns.has(column));
      if (!columns.length) throw new Error(`resources.${table} contains a row with no restorable columns`);
      const quotedColumns = columns.map((column) => `"${column}"`).join(",");
      const placeholders = columns.map(() => "?").join(",");
      database.prepare(`INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`)
        .run(...columns.map((column) => toSqliteValue(sourceRow[column])));
      inserted += 1;
    }
    counts[table] = inserted;
  }
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length) throw new Error(`Foreign-key validation failed: ${JSON.stringify(violations.slice(0, 5))}`);
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  database.close();
  fail(error instanceof Error ? error.message : "restore failed");
}
database.close();
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
console.log(`Restored ${total} rows into ${resolvedDatabasePath}`);
console.log(`Backup version ${backup.backup_version}; exported ${backup.exported_at}; schema ${backup.schema.supabase_migration}`);
