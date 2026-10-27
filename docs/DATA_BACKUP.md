# Data backup and local restore

Current backup version is 15 (`202610270003_insight_deletion`). Insights retains deletion markers and hidden-version floors alongside semantic reading pointers and execution generations. Retained immutable snapshots and cross-report references are included; restoring a backup preserves deletion visibility and does not automatically recreate deleted reports. Versions 1–14 remain readable. Manual memberships retain mode/expiry in `subscriptions` and purchase keys, paid/bonus durations and resulting expiry in `subscription_payments`; spending is not duplicated in a second purchase table.  The manual membership regression test exports, restores and reopens these records with their reminder links.

EvaOrbit exports one JSON document from the authenticated production Supabase account. The export endpoint is read-only and relies on the same account allowlist and row-level security as the rest of the app.

## Export

Open **Settings → Data & Backup** in production and choose **Export backup**. The downloaded file is named `evaorbit-backup-YYYY-MM-DD.json`. The page remembers the most recent successful export time in that browser only.

The document shape is:

```json
{
  "backup_version": 6,
  "exported_at": "2026-09-05T08:00:00.000Z",
  "schema": { "supabase_migration": "202609200001_memory_graph_v02" },
  "source": { "backend": "supabase" },
  "resources": {
    "memory_entities": [],
    "memory_facts": [],
    "memory_sources": [],
    "memory_fact_candidates": [],
    "food_logs": [],
    "food_places": [],
    "food_dishes": []
  }
}
```

`resources` contains every table in the explicit allowlist in `src/lib/data-backup.ts`. Rows retain their IDs, foreign-key values, timestamps, date-only anchors, and explicit-time flags. Supabase `user_id` values are removed because a local SQLite database has a fixed local owner.

Version 2 adds `memory_entities`, `memory_facts`, and `memory_sources`. Version 6 adds the reviewed `memory_fact_candidates` queue used by Memory Graph v0.2. Older accepted backups normalize resources that did not exist in that version to empty arrays, so restore never manufactures graph data.
Version 10 adds `software_library`, including platform lists, licence scope, acquisition method and optional acquisition dates. It is independent of subscription/payment tables. Versions 1–9 normalize its missing resource to an empty array; new-version backups require the resource. No software examples are created during migration or restore.
Version 11 adds `insight_reports` followed by `insight_report_versions`, preserving stable report IDs, immutable snapshots, evidence, request identities and version links. Versions 1–10 normalize missing report resources to empty arrays. Local restore deletes versions before reports and imports reports before versions; the version UPDATE guard remains enabled.
Version 12 adds `insight_runs` and `insight_run_attempts` after report versions, retaining bounded Agent attempts, frozen inputs, leases and result references. Versions 1–11 normalize these resources to empty arrays. Terminal attempts and their inputs remain immutable; restore inserts historical rows without updating them.

AI settings/providers/models, API-key ciphertext, push subscriptions, native device credentials, HealthKit aggregates/raw samples, authentication/session/cookie data, and import bookkeeping are excluded. Conversation text is retained, but provider/model foreign keys are set to `null` because the secret-bearing provider tables are excluded. Storage binaries are not embedded; media records and their metadata/path fields are included.

## Restore locally

Set the development backend explicitly in `.env.local`:

```dotenv
EVAORBIT_DATA_BACKEND=sqlite
EVAORBIT_SQLITE_PATH=./data/eva-orbit.db
```

Then run:

```sh
npm run data:restore -- path/to/evaorbit-backup-YYYY-MM-DD.json
```

Run `npm run dev` once first if the local database has not been created yet, and stop that dev server before restoring. The command verifies the current SQLite schema, deletes only allowlisted local business tables, imports them in dependency order, and validates all foreign keys before committing. It refuses to run when `NODE_ENV=production`, on Vercel, or unless `EVAORBIT_DATA_BACKEND` is explicitly `sqlite`. It never reads `DATABASE_URL` or writes to Supabase.
