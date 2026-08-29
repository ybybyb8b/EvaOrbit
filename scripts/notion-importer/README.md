# One-time Notion → EvaOrbit importer

This migration CLI consumes prepared JSON only. It does not call Notion and does not create ongoing synchronization.

It can also run the separate Notion Export Adapter before this importer:

```powershell
npm run import:notion -- --notion-export "path/to/notion-export.zip" --dry-run
npm run import:notion -- --notion-export "path/to/unpacked-export" --dry-run
npm run import:notion -- --notion-export "memohub.zip" --notion-export "diary-pages.zip" --dry-run
```

Repeat `--notion-export` when Notion delivered related databases and page bodies in separate ZIP files; nested Notion ZIP wrappers are expanded with path and size safety checks. The adapter always writes a reviewable `<export-name>.normalized.json`, `notion-export-report.json`, and `notion-export-sample.json` before invoking the importer. Use `--normalized-output <file>` and `--report-dir <directory>` to choose their locations. `--notion-timezone +08:00` controls the explicit timezone assumption for timestamp-like CSV fields.

The supported MemoHub export profile is discovered by its inspected CSV headers, and `_all.csv` is preferred over a filtered view export. It migrates Memo, Chronicle, and Lucius Diary only; `lucius_case` remains supported by the normalized importer but is never emitted by the export adapter.

If the export has no per-page Notion ID, the adapter uses `notion-export:<database-id>:sha256(<ordered raw CSV row>)`. This never uses title or date, is deterministic for the frozen export and exact reruns, and is explicitly reported as a fallback identity. It cannot recognize an edited row from a later export as the same Notion page. Missing page bodies are errors rather than fabricated content.

## Input

Use the shape in `scripts/fixtures/notion-memohub.sample.json`. The top-level arrays are `memo`, `chronicle`, `lucius_diary`, and `lucius_case`. A `records` array with an explicit `resource` on every item is also accepted. Resource fields may be flat or nested under `data`.

Every item requires `notion_page_id` and may include `notion_url`, `notion_created_at`, and `notion_updated_at`. Identity is always `source_system=notion` plus `source_id=notion_page_id`; titles and dates are never identity keys.

Memo types/statuses and Lucius Case enums accept both EvaOrbit's internal English values and the Chinese labels used by the UI. Chronicle content may use `content_md` or the legacy alias `content`.

Memo, Diary, and Cases store `source_system`, `source_id`, `source_url`, and `imported_at` in their existing trace fields. Chronicle stays on its current schema; its Notion metadata is retained only in `migration_import_ledger`.

## Run

Dry run is the default and does not write EO records or a SQLite ledger:

```powershell
npm run import:notion -- --input scripts/fixtures/notion-memohub.sample.json --dry-run --sqlite data/personal-hub.db
```

Import into local SQLite:

```powershell
npm run import:notion -- --input path/to/export.json --apply --sqlite data/personal-hub.db
```

Import into Supabase Postgres after `npm run db:migrate`:

```powershell
$env:DATABASE_URL = "postgresql://..."
$env:MIGRATION_USER_ID = "00000000-0000-4000-8000-000000000000"
npm run import:notion -- --input path/to/export.json --apply
```

Use `--report-dir <directory>` to choose the output directory. Every run writes `migration-report.json`, `duplicate-report.json`, and `error-report.json`.

Exact content matches with a different Notion page ID are reported and skipped. Existing records with the same source identity are updated only when the mapped payload changed; an identical rerun is reported as unchanged. The importer rejects oversize values instead of truncating text or tags.
