import type { Tracker, TrackerEntry, TrackerField } from "./types";
type Row = Record<string, unknown>;

export function trackerFromRow(row: Row): Tracker {
  return { archivedAt: row.archived_at ? String(row.archived_at) : null, id: Number(row.id), name: String(row.name), icon: String(row.icon), iconType: (row.icon_type ?? "default") as Tracker["iconType"], iconValue: String(row.icon_value ?? ""), groupName: String(row.group_name), timeType: row.time_type as Tracker["timeType"], quickCaptureEnabled: Boolean(row.quick_capture_enabled), statsConfig: row.stats_config && typeof row.stats_config === "object" ? row.stats_config as Record<string, unknown> : {}, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function trackerFieldFromRow(row: Row): TrackerField {
  return { id: Number(row.id), trackerId: Number(row.tracker_id), key: String(row.field_key ?? `field_${row.id}`), name: String(row.name), type: row.type as TrackerField["type"], required: Boolean(row.required), defaultValue: row.default_value ?? null, options: Array.isArray(row.options_json) ? row.options_json.map(String) : [], showAfterQuickCapture: Boolean(row.show_after_quick_capture), includeInStats: Boolean(row.include_in_stats), sortOrder: Number(row.sort_order), unit: String(row.unit ?? ""), precision: Number(row.precision ?? 0), config: row.config_json && typeof row.config_json === "object" ? row.config_json as Record<string, unknown> : {}, archivedAt: row.archived_at ? String(row.archived_at) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function trackerEntryFromRow(row: Row): TrackerEntry {
  return { id: Number(row.id), trackerId: Number(row.tracker_id), occurredAt: String(row.occurred_at), endAt: row.end_at ? String(row.end_at) : null, values: row.values_json && typeof row.values_json === "object" ? row.values_json as Record<string, unknown> : {}, note: String(row.note), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
