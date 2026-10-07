# MCP boundary

The remote MCP endpoint is authenticated and runs all operations inside the
request's per-user repository context. Only the 8 generic tools are registered;
dedicated Food/Drink and Tracker tools are removed. Generic tools route through the server-side Resource Registry;
they never accept table names or expose arbitrary database CRUD.

Each registered resource declares capabilities and a public schema, validates
create/update payloads strictly, preserves PATCH semantics, and delegates
deletes and non-CRUD actions to existing business services. Register resources
one at a time rather than mirroring every database table.

The registry has 36 resources and 37 actions. Food Log, Drink Log, Food Library,
daily nutrition and manual energy now route through generic tools to their
existing parsers/services. Drink mutations include item.limits. Food portions
preserve snapshots; Food Library create is name/brand upsert and removal keeps
referenced history. Daily Energy replacement is an explicit upsert action.
Tracker search supports cursors so generic discovery can read more than 100
Trackers; use get for fields and create_entry with data.values.

Schema discovery includes `create_fields`, `update_fields`, Cat Record
`field_variants`, and `action_schemas`. Action contracts are the allowed-key
boundary as well as documentation; unsupported data is rejected before any
service is invoked. Tracker child mutations must belong to the specified
Tracker. Cat Pet delete remains a compatibility archive entry point and reports
`deleted: false, action: "archived"`. Cat Routine archive retains the routine and
execution history and stops reminders. Cat Routine delete removes the routine
and owned reminder (with occurrences), reports `deleted: true`, and preserves
generated care records and notification delivery snapshots.

`task` exposes the restored Task module through generic MCP CRUD. Search accepts
status and priority filters, optional `due_time` values project into unified
Reminder delivery, and completion and reopening remain explicit actions.

Memory Graph v0.1 registers three resources without changing the generic MCP
tool protocol:

- `memory_entity`: canonical-name and alias search, get/create/update, archive,
  restore, and atomic merge. Merged entities remain readable redirects.
- `memory_fact`: direct `in`/`out`/`both` entity queries with predicate,
  perspective, status, and `valid_on` filters; get/create and metadata-only
  update; invalidate and restore. Subject, predicate, object, and perspective
  cannot be rewritten by update.
- `memory_source`: forward lookup by Fact and reverse lookup by resource plus an
  opaque string record ID, with create/get/update/delete for provenance links.

`perspective_entity_id` attributes an assertion's viewpoint; it is not access
control or a claim about what an Identity knows. `valid_to` ends real-world
validity, while `invalidated` records graph correction or withdrawal. Entity
and Fact delete are intentionally unavailable.
