# EvaOrbit Remote MCP

- Endpoint: `https://<your-domain>/api/mcp`
- Transport: stateless Streamable HTTP; there is no legacy `/sse` endpoint
- Authentication: Supabase OAuth 2.1 access token in `Authorization: Bearer <token>`

## Environment

Set the existing Supabase values locally and in Vercel:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_example
```

Enable the Supabase OAuth Server, Dynamic OAuth Apps, and set its authorization path to `/oauth/consent`. The MCP resource identifier is `https://eva-orbit.vercel.app/api/mcp`.

## Tools

The MCP exposes exactly 8 generic tools:

- `eo_resources`
- `eo_schema`
- `eo_search`
- `eo_get`
- `eo_create`
- `eo_update`
- `eo_delete`
- `eo_action`

Generic tools keep `resource` as a plain string. Call `eo_resources`, then `eo_schema`, before operating on a resource. The server-side registry decides which resources, fields, capabilities, validations, and actions are available.

The current registry contains 36 resources:

- Memory and capture: `memory_entity`, `memory_fact`, `memory_source`, `inbox`, `memo`, `chronicle`.
- Work and calendar: `task`, `calendar_event`, `project`, `project_item`.
- Lucius: `lucius_diary`, `lucius_case`, `lucius_state`, `lucius_post`, `lucius_post_comment`.
- People: `relation_person`, `relation_event`, `person_note`.
- Health and activity: `health_record`, `training_log`, `tracker`.
- Media: `media`, `media_series`.
- Cats: `cat_pet`, `cat_record`, `cat_routine`.
- Reminders and subscriptions: `reminder`, `subscription`.
- Food sources and limits: `food_place`, `food_dish`, `drink_limit`.
- Food/Drink and nutrition: `food_log`, `drink_log`, `food_library`, `nutrition_daily`, `daily_energy`.

These are business resources discovered through tools, not MCP protocol `resources/list` registrations. All dedicated Food/Drink tools have been removed; callers must use the generic resource operations below. `tracker_list` and `tracker_create_entry` have been removed: use `eo_search(tracker)` plus `eo_get(tracker,id)`, and `eo_action(tracker,create_entry)`. Search exposes `group_name`; detail fields include historical fields, so filter out non-null `archived_at` when presenting active fields. Entry input uses `data.values`; action output uses `result`.

Tracker search defaults to 20 records (maximum 100 per page). Follow `next_cursor` with the same query until null to read the entire list. Pages use ID order and are not a snapshot during concurrent mutations. Other resources currently reject non-empty cursors.

Food/Drink migration mapping (old tool names are no longer registered):

| Former tools | Generic operation |
| --- | --- |
| `food_search_recent` / `drink_search_recent` | `eo_search` with resource `food_log` / `drink_log`; date/type/association inputs go in `filters`, query and limit stay at the top level |
| `food_create/update/delete` / `drink_create/update/delete` | `eo_create/update/delete` for `food_log` / `drink_log`; writes go in `data`, update/delete ID stays at the top level |
| `food_library_search/create/update/delete` | Generic CRUD on `food_library`; name/brand/category search inputs go in `filters`, keyword alias becomes `query` |
| `nutrition_get_daily_summary` | `eo_get(nutrition_daily)`, with date as `id` |
| `daily_energy_upsert` | `eo_action(daily_energy, upsert)`, with date as `id` and both energy values in `data` |

Former `record/records` responses become `item/items`. The daily energy summary moves under `result`; Drink limit results move under `item.limits`. To preserve a previous recent-search size, pass its limit explicitly (generic defaults to 20). Old tool aliases are rejected. Existing external MCP configurations must refresh tool discovery and use this mapping.

Food/Drink generic calls:

```json
{"name":"eo_create","arguments":{"resource":"food_log","data":{"title":"Lunch","food_place_id":1,"food_dish_ids":[2],"food_library_items":[{"food_library_id":3,"quantity":50,"unit":"g"}],"food_kcal_mode":"auto"}}}
{"name":"eo_search","arguments":{"resource":"food_log","filters":{"date":"2026-10-07","food_dish_id":2}}}
{"name":"eo_update","arguments":{"resource":"drink_log","id":4,"data":{"notes":"Only change notes"}}}
{"name":"eo_get","arguments":{"resource":"nutrition_daily","id":"2026-10-07"}}
{"name":"eo_action","arguments":{"resource":"daily_energy","id":"2026-10-07","action":"upsert","data":{"resting_energy_kcal":1200,"active_energy_kcal":300}}}
```

CRUD responses use `item` or search `items`. Drink create/update includes limit results in `item.limits`; nested generic results use snake_case. Food PATCH preserves omitted associations, immutable portion snapshots and date precision; `[]` clears dishes/portions. Food writes use `food_dish_ids` and `food_library_items`; legacy single IDs are read-only projections (the search filter `food_dish_id` still means “contains this dish”). Drink retains its writable single `food_library_id`; `null` clears an association.

`food_library` create retains upsert by name + brand, with create defaults; update by ID is PATCH. Removing an item archives it when referenced, otherwise deletes it, reporting `action` and `deleted`. `nutrition_daily` is read-only and includes effective energy and manual/HealthKit provenance. `daily_energy` get returns manual values; its upsert requires both nullable energy values, replaces both values and notes (omitted notes becomes empty), and returns a calculated summary under `result`. Null clears a manual override, allowing HealthKit fallback; this is separate from native ingestion.

`eo_schema` retains `writable_fields` for compatibility and adds operation-specific `create_fields` and `update_fields`. Read `field_variants` for Cat Record's kind-specific fields. `action_schemas` describes each action's required ID, ID meaning, data fields, required data, validation rules and result. Unknown action data is rejected rather than silently ignored.

Memo searches default to active records unless a status filter is supplied. `lucius_case/record_recurrence` atomically updates recurrence counters and dates. `relation_event/settle_advance` uses the advance **flow** ID, not an event ID.

Drink Limit updates are PATCH: `{ "enabled": false }` preserves other settings. Cat Routine updates preserve the existing recurrence mode, anchor, local reminder time, timezone and linked reminder. Prefer `first_due_date`, `next_due_date`, `configured_reminder_time`, `recurrence_mode`, `anchor_date` and `timezone`; legacy `first_due_at`/`next_due_at` remain accepted. `eo_delete(cat_pet)` archives and returns `deleted: false, action: "archived"`. Cat Routine has distinct operations: `eo_action(cat_routine, archive)` retains the routine, reminder and execution history while disabling reminders; `eo_delete(cat_routine)` permanently removes the routine and linked reminder (including its occurrences) and returns `deleted: true`. Generated care records and notification delivery snapshots remain.

Tracker child update/delete actions check membership in the specified Tracker. Goal inputs describe count goals (`operator`, `target_value`, `period_type`, `custom_period`, `enabled`); old ignored `name`, `field_id`, `period_start` and `period_end` inputs are rejected. Tracker reminders accept `reminder_mode`, `configured_time`, `period_days`, `anchor_date`, `timezone` and `enabled`. Valid legacy aliases `reminder_type`, `time_of_day` and `interval_days` remain supported; conflicting aliases and unsupported `days_of_week` are rejected.

Reminder search includes all module-owned target types, including `task` and `cat_food`. Manual create/update still supports only `cat`, `cat_household` and `tracker`; module-owned projections must be configured through their owning resource. Completion, skip and snooze remain available through the Reminder business services.

## Local test

Complete the Supabase OAuth authorization-code flow, then POST an MCP initialize request with the issued access token:

```powershell
$headers = @{ Authorization = "Bearer $env:SUPABASE_OAUTH_ACCESS_TOKEN"; Accept = "application/json, text/event-stream" }
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0"}}}'
Invoke-RestMethod http://localhost:3000/api/mcp -Method Post -Headers $headers -ContentType application/json -Body $body
```

For ChatGPT, select OAuth and enter `https://eva-orbit.vercel.app/api/mcp`. For MCP Inspector, choose Streamable HTTP, enter the endpoint URL, complete OAuth, and use the issued access token.
