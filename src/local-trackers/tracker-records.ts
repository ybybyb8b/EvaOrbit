import type {LocalTrackerRecord} from "@/lib/tracker-local-store";
import type {TrackerField} from "@/lib/types";
export function asField(row: LocalTrackerRecord): TrackerField {
  return { id: row.serverId ?? 0, trackerId: Number(row.payload.trackerId ?? 0), key: String(row.payload.key), name: String(row.payload.name), type: row.payload.type as TrackerField["type"], required: Boolean(row.payload.required), defaultValue: row.payload.defaultValue ?? null, options: row.payload.options as string[] ?? [], showAfterQuickCapture: Boolean(row.payload.showAfterQuickCapture), includeInStats: Boolean(row.payload.includeInStats), sortOrder: Number(row.payload.sortOrder ?? 0), unit: String(row.payload.unit ?? ""), precision: Number(row.payload.precision ?? 0), config: {}, archivedAt: row.payload.archivedAt as string | null ?? null, createdAt: String(row.payload.createdAt ?? ""), updatedAt: String(row.payload.updatedAt ?? "") };
}
export function belongs(row: LocalTrackerRecord, tracker: LocalTrackerRecord) { return row.payload.trackerLocalId === tracker.id || tracker.serverId !== undefined && row.payload.trackerId === tracker.serverId; }
