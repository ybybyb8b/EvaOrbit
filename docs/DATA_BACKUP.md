# Data backup and local restore

EvaOrbit exports one JSON document from the authenticated production Supabase account. The export endpoint is read-only and relies on the same account allowlist and row-level security as the rest of the app.

## Export

Open **Settings → Data & Backup** in production and choose **Export backup**. The downloaded file is named `evaorbit-backup-YYYY-MM-DD.json`. The page remembers the most recent successful export time in that browser only.

The document shape is:

```json
{
  "backup_version": 1,
  "exported_at": "2026-09-05T08:00:00.000Z",
  "schema": { "supabase_migration": "202609050001_meal_reminders" },
  "source": { "backend": "supabase" },
  "resources": {
    "food_logs": [],
    "food_places": [],
    "food_dishes": []
  }
}
```

`resources` contains every table in the explicit allowlist in `src/lib/data-backup.ts`. Rows retain their IDs, foreign-key values, timestamps, date-only anchors, and explicit-time flags. Supabase `user_id` values are removed because a local SQLite database has a fixed local owner.

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
