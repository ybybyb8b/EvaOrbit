import type { HealthRecord } from "./types";
import { ONGOING_HEALTH_RECORD_TYPES } from "./types.ts";

export function healthRecordUsesStatus(type: HealthRecord["type"]) {
  return ONGOING_HEALTH_RECORD_TYPES.includes(type as typeof ONGOING_HEALTH_RECORD_TYPES[number]);
}

export function buildHealthDashboard(records: HealthRecord[], currentLimit = 4, recentLimit = 6) {
  const currentRecords = records.filter((record) => record.status === "active" && healthRecordUsesStatus(record.type));
  const current = currentRecords.slice(0, currentLimit);
  const currentIds = new Set(currentRecords.map((record) => record.id));
  const recent = records.filter((record) => !currentIds.has(record.id)).slice(0, recentLimit);
  return { current, recent };
}
