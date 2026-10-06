# Tracker settings lifecycle

Tracker and custom properties expose separate archive and permanent-delete actions.

- Archiving a Tracker preserves entries, fields and goals, hides it from active lists and quick logging, and disables its reminders. Restoring it does not automatically re-enable reminders.
- Archiving a property preserves its historical values and makes it available under archived properties for restoration.
- Permanently deleting a property removes its definition and its values from historical entries. Other properties, entry dates and notes remain intact. Both repositories perform this operation in a transaction.
- Permanently deleting a Tracker removes its entries, properties, goals and linked reminders. The UI shows the Tracker name and record count before confirmation.

Settings allow editing the Tracker name, searchable/creatable group and capture mode. Property edits allow name, required status and inclusion in statistics; the stable key and type remain unchanged to preserve historical meanings. Goals and reminders have separate sections. All destructive confirmations use the global Form Sheet and describe irreversible data loss.

## API compatibility

`PATCH /api/trackers/:id` accepts an `archived` boolean. Property PATCH accepts `name`, `required`, `includeInStats` and `archived`. Property operations verify that the property belongs to the requested Tracker.

Legacy property DELETE continues to archive. The new explicit `permanent=true` query selects permanent deletion, preserving the behavior of older native and MCP clients.

## Storage rollout

SQLite migration 70 adds `trackers.archived_at` automatically when the database opens. The isolated lifecycle test covers archive/restore, property editing, ownership checks, historical value removal, transaction rollback and cascading Tracker deletion.

Supabase requires `supabase/migrations/202610060001_tracker_settings_lifecycle.sql` before deploying this UI. It adds the archive column and an authenticated, RLS-respecting transaction function for permanent property deletion. This task has not applied that migration to a live cloud database or validated it in a PostgreSQL runtime.

Desktop and 402 × 874 responsive browser checks used an isolated temporary SQLite database. Real iPhone Safari/PWA and keyboard behavior still require device validation. No production records were changed.
