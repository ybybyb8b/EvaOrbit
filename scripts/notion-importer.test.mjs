import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { runNotionImport, writeImportReports } from "./notion-importer/core.mjs";
import { SqliteNotionImportStore } from "./notion-importer/stores.mjs";

const fixturePath = new URL("./fixtures/notion-memohub.sample.json", import.meta.url);

function createTarget(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      type TEXT NOT NULL, status TEXT NOT NULL, tags TEXT NOT NULL, event_date TEXT, confirmed_at TEXT,
      merged_into_id INTEGER, source_system TEXT, source_id TEXT, source_url TEXT, imported_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chronicle_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL,
      content_md TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE lucius_diary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, date TEXT NOT NULL, content TEXT NOT NULL,
      tags TEXT NOT NULL, source_system TEXT, source_id TEXT, source_url TEXT, imported_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE lucius_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, title TEXT NOT NULL, error_type TEXT NOT NULL,
      severity TEXT NOT NULL, status TEXT NOT NULL, trigger_scenes TEXT NOT NULL, error_quote TEXT NOT NULL,
      cause TEXT NOT NULL, correct_behavior TEXT NOT NULL, mandatory_rule TEXT NOT NULL, next_check TEXT,
      punishment TEXT NOT NULL, first_occurred_date TEXT NOT NULL, latest_occurred_date TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL, consecutive_correct_count INTEGER NOT NULL, recurrence_interval_days INTEGER,
      is_recurrence INTEGER NOT NULL, reset_threshold INTEGER NOT NULL, source_system TEXT, source_id TEXT,
      source_url TEXT, imported_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  database.close();
}

function counts(database) {
  return Object.fromEntries([
    ["memo", "memos"], ["chronicle", "chronicle_entries"], ["lucius_diary", "lucius_diary_entries"], ["lucius_case", "lucius_cases"],
  ].map(([resource, table]) => [resource, Number(database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count)]));
}

test("Notion importer dry-runs, imports four resources, reports duplicates and stays idempotent", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-notion-import-"));
  const databasePath = path.join(directory, "target.sqlite");
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  createTarget(databasePath);
  const store = new SqliteNotionImportStore(databasePath);
  const firstTimestamp = () => "2026-08-29T12:00:00.000Z";
  try {
    const dryRun = await runNotionImport({ input, store, apply: false, now: firstTimestamp, inputName: "fixture" });
    assert.deepEqual(dryRun.migrationReport.totals, { total: 5, valid: 4, created: 4, updated: 0, unchanged: 0, skipped_duplicates: 1, errors: 0 });
    assert.equal(dryRun.duplicateReport.duplicates[0].kind, "input_content_match");
    assert.deepEqual(dryRun.migrationReport.warnings[0].ignored_fields, ["legacy_notion_category"]);
    const afterDryRun = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(counts(afterDryRun), { memo: 0, chronicle: 0, lucius_diary: 0, lucius_case: 0 });
    assert.equal(afterDryRun.prepare("SELECT 1 FROM sqlite_master WHERE name='migration_import_ledger'").get(), undefined);
    afterDryRun.close();

    const imported = await runNotionImport({ input, store, apply: true, now: firstTimestamp, inputName: "fixture" });
    assert.deepEqual(imported.migrationReport.totals, { total: 5, valid: 4, created: 4, updated: 0, unchanged: 0, skipped_duplicates: 1, errors: 0 });
    const database = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(counts(database), { memo: 1, chronicle: 1, lucius_diary: 1, lucius_case: 1 });
    assert.equal(database.prepare("SELECT count(*) AS count FROM migration_import_ledger").get().count, 4);
    const memo = database.prepare("SELECT * FROM memos").get();
    assert.equal(memo.source_system, "notion");
    assert.equal(memo.source_id, "notion-memo-001");
    assert.equal(memo.content, "第一行中文。\n\n第二行包含 **Markdown**、emoji 🪐 与特殊字符 <>&。");
    assert.deepEqual(JSON.parse(memo.tags), ["长期记忆", "中文"]);
    const chronicle = database.prepare("SELECT * FROM chronicle_entries").get();
    assert.match(chronicle.content_md, /保留换行\n- 特殊字符：`<tag>` & 🐈/);
    assert.equal(Object.hasOwn(chronicle, "source_system"), false);
    const ledger = database.prepare("SELECT * FROM migration_import_ledger WHERE resource='chronicle'").get();
    assert.equal(ledger.source_id, "notion-chronicle-001");
    assert.equal(ledger.source_created_at, "2024-02-03T04:05:06.000Z");
    database.close();

    const rerun = await runNotionImport({ input, store, apply: true, now: () => "2026-08-30T12:00:00.000Z", inputName: "fixture" });
    assert.equal(rerun.migrationReport.totals.unchanged, 4);
    assert.equal(rerun.migrationReport.totals.created, 0);
    assert.equal(rerun.migrationReport.totals.skipped_duplicates, 1);
    const afterRerun = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(counts(afterRerun), { memo: 1, chronicle: 1, lucius_diary: 1, lucius_case: 1 });
    assert.equal(afterRerun.prepare("SELECT imported_at FROM memos").get().imported_at, "2026-08-29T12:00:00.000Z");
    afterRerun.close();

    const changed = structuredClone(input);
    changed.memo[0].title = "标题变了，但 identity 不变";
    const updated = await runNotionImport({ input: { memo: changed.memo }, store, apply: true, now: () => "2026-08-31T12:00:00.000Z" });
    assert.equal(updated.migrationReport.totals.updated, 1);
    const afterUpdate = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(afterUpdate.prepare("SELECT count(*) AS count FROM memos").get().count, 1);
    assert.equal(afterUpdate.prepare("SELECT title FROM memos").get().title, "标题变了，但 identity 不变");
    afterUpdate.close();

    const invalid = structuredClone(input.memo[0]);
    invalid.notion_page_id = "invalid-long-content";
    invalid.content = "中".repeat(100001);
    const errors = await runNotionImport({ input: { memo: [invalid] }, store, apply: true, now: firstTimestamp });
    assert.equal(errors.migrationReport.totals.errors, 1);
    assert.match(errors.errorReport.errors[0].message, /不会截断数据/);

    const reportsDirectory = path.join(directory, "reports");
    const files = writeImportReports(rerun, reportsDirectory);
    assert.equal(JSON.parse(fs.readFileSync(files.migration, "utf8")).totals.unchanged, 4);
    assert.ok(fs.existsSync(files.duplicate));
    assert.ok(fs.existsSync(files.error));
  } finally {
    await store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Notion ledger migration keeps Chronicle schema untouched and protects source identity", () => {
  const migration = fs.readFileSync(new URL("../supabase/migrations/202608290006_notion_import_ledger.sql", import.meta.url), "utf8");
  assert.match(migration, /unique \(user_id, source_system, source_id\)/i);
  assert.match(migration, /resource in \('memo', 'chronicle', 'lucius_diary', 'lucius_case'\)/i);
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /alter table public\.chronicle_entries/i);
  assert.doesNotMatch(migration, /title.*unique|date.*unique/i);
});

test("Notion importer CLI runs dry-run, import and idempotent rerun with JSON reports", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-notion-cli-"));
  const databasePath = path.join(directory, "target.sqlite");
  const cliPath = path.resolve("scripts/import-notion-json.mjs");
  const inputPath = path.resolve("scripts/fixtures/notion-memohub.sample.json");
  const run = (mode, reportName) => spawnSync(process.execPath, [cliPath, "--input", inputPath, mode, "--sqlite", databasePath, "--report-dir", path.join(directory, reportName)], { cwd: path.resolve("."), encoding: "utf8" });
  createTarget(databasePath);
  try {
    const dryRun = run("--dry-run", "dry-run");
    assert.equal(dryRun.status, 0, dryRun.stderr);
    let database = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(counts(database), { memo: 0, chronicle: 0, lucius_diary: 0, lucius_case: 0 });
    database.close();

    const imported = run("--apply", "import");
    assert.equal(imported.status, 0, imported.stderr);
    database = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(counts(database), { memo: 1, chronicle: 1, lucius_diary: 1, lucius_case: 1 });
    database.close();

    const rerun = run("--apply", "rerun");
    assert.equal(rerun.status, 0, rerun.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(directory, "rerun", "migration-report.json"), "utf8"));
    assert.equal(report.totals.unchanged, 4);
    assert.equal(report.totals.created, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "rerun", "duplicate-report.json"), "utf8")).duplicates.length, 5);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "rerun", "error-report.json"), "utf8")).errors.length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
