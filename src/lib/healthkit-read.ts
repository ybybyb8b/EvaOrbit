import { ValidationError } from "./validation.ts";

export const HEALTHKIT_READ_SCOPE = "healthkit:read-samples:write"; // Device → EO ingest; never HealthKit write access.
export const healthKitReadMetrics = ["sleep", "heart_rate", "resting_heart_rate", "hrv"] as const;
export type HealthKitReadMetric = typeof healthKitReadMetrics[number];
export type HealthKitReadChange = {
  operation: "upsert" | "delete";
  metric: HealthKitReadMetric;
  sampleId: string;
  streamId: string;
  revision: number;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  timeZoneSource?: "metadata" | "device";
  stage?: number;
  value?: number;
  unit?: "count/min" | "ms";
  sourceBundle?: string;
  sourceName?: string;
  syncIdentifier?: string;
  syncVersion?: number;
};

export function enabledHealthKitReadMetrics(config = process.env.HEALTHKIT_SYNC_METRICS): HealthKitReadMetric[] {
  const requested = config?.split(",").map(value => value.trim()) ?? ["sleep"];
  return healthKitReadMetrics.filter(metric => metric === "sleep" || requested.includes(metric));
}

export function parseHealthKitReadChanges(value: unknown): HealthKitReadChange[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new ValidationError("HealthKit read sample batch is invalid");
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("HealthKit read sample is invalid");
    const row = raw as Record<string, unknown>;
    if (!healthKitReadMetrics.includes(row.metric as HealthKitReadMetric) || !["upsert", "delete"].includes(String(row.operation))) throw new ValidationError("HealthKit read metric or operation is invalid");
    if (typeof row.sampleId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.sampleId)) throw new ValidationError("HealthKit sample ID is invalid");
    if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1) throw new ValidationError("HealthKit sample revision is invalid");
    if (typeof row.streamId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.streamId)) throw new ValidationError("HealthKit stream ID is invalid");
    const change: HealthKitReadChange = { operation: row.operation as HealthKitReadChange["operation"], metric: row.metric as HealthKitReadMetric, sampleId: row.sampleId.toLowerCase(), streamId: row.streamId.toLowerCase(), revision: Number(row.revision) };
    if (change.operation === "delete") return change;
    const instant = (input: unknown) => typeof input === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input) && Number.isFinite(Date.parse(input));
    if (!instant(row.startAt) || !instant(row.endAt) || Date.parse(String(row.endAt)) < Date.parse(String(row.startAt))) throw new ValidationError("HealthKit sample interval is invalid");
    if (typeof row.timeZone !== "string" || !["metadata", "device"].includes(String(row.timeZoneSource))) throw new ValidationError("HealthKit sample timezone is invalid");
    try { new Intl.DateTimeFormat("en", { timeZone: row.timeZone }); } catch { throw new ValidationError("HealthKit sample timezone is invalid"); }
    Object.assign(change, { startAt: row.startAt, endAt: row.endAt, timeZone: row.timeZone, timeZoneSource: row.timeZoneSource });
    if (change.metric === "sleep") {
      if (!Number.isInteger(row.stage) || Number(row.stage) < 0 || Number(row.stage) > 100 || Date.parse(String(row.endAt)) <= Date.parse(String(row.startAt))) throw new ValidationError("HealthKit sleep stage is invalid");
      change.stage = Number(row.stage); // Preserve raw category, including future values; unknown stages are never counted as sleep.
    } else {
      const unit = change.metric === "hrv" ? "ms" : "count/min";
      if (row.unit !== unit || typeof row.value !== "number" || !Number.isFinite(row.value) || row.value < 0 || row.value > (change.metric === "hrv" ? 10000 : 1000)) throw new ValidationError("HealthKit quantity or unit is invalid");
      change.value = row.value; change.unit = unit;
    }
    for (const key of ["sourceBundle", "sourceName", "syncIdentifier"] as const) {
      if (row[key] !== undefined && typeof row[key] !== "string") throw new ValidationError("HealthKit source is invalid");
      if (typeof row[key] === "string") change[key] = row[key].slice(0, 255);
    }
    if (row.syncVersion !== undefined) {
      if (!Number.isInteger(row.syncVersion) || Number(row.syncVersion) < 1 || Number(row.syncVersion) > 2147483647) throw new ValidationError("HealthKit sync version is invalid");
      change.syncVersion = Number(row.syncVersion);
    }
    return change;
  });
}
