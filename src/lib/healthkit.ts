import { createHash, randomBytes } from "node:crypto";
import { ValidationError } from "./validation.ts";
import { normalizeWeightKg } from "./weight.ts";

export const HEALTHKIT_ENERGY_SCOPE = "healthkit:energy:write";
export const HEALTHKIT_BODY_MASS_SCOPE = "healthkit:body-mass:write";
export const HEALTHKIT_INGEST_BATCH_LIMIT = 50;

export type HealthKitEnergyMetric = "resting" | "active";
export type HealthKitEnergySnapshot = {
  localDate: string;
  metric: HealthKitEnergyMetric;
  kcal: number;
  revision: number;
  sampleCount: number;
  calculatedAt: string;
};
export type HealthKitBodyMassChange = {
  operation: "upsert" | "delete";
  sampleId: string;
  occurredAt?: string;
  weightKg?: number;
  sourceBundle?: string;
  sourceName?: string;
  syncIdentifier?: string;
  syncVersion?: number;
};

export type NativeDeviceAccessRecord = { revoked_at?: unknown; scopes?: unknown } | null;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("HealthKit payload is invalid");
  return value as Record<string, unknown>;
}

export function parseInstallationId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError("Installation ID is invalid");
  }
  return value.toLocaleLowerCase();
}

function calendarDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("HealthKit local date is invalid");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new ValidationError("HealthKit local date is invalid");
  return value;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new ValidationError(`${label} is invalid`);
  return value;
}

function safeInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new ValidationError(`${label} is invalid`);
  return value as number;
}

export function parseHealthKitEnergySnapshots(value: unknown): HealthKitEnergySnapshot[] {
  const body = record(value);
  if (!Array.isArray(body.snapshots) || body.snapshots.length < 1 || body.snapshots.length > HEALTHKIT_INGEST_BATCH_LIMIT) {
    throw new ValidationError("HealthKit snapshot batch is invalid");
  }
  const snapshots = body.snapshots.map((item) => {
    const snapshot = record(item);
    if (snapshot.metric !== "resting" && snapshot.metric !== "active") throw new ValidationError("HealthKit metric is invalid");
    const metric: HealthKitEnergyMetric = snapshot.metric;
    if (typeof snapshot.calculatedAt !== "string" || !Number.isFinite(Date.parse(snapshot.calculatedAt))) throw new ValidationError("HealthKit calculated time is invalid");
    return {
      localDate: calendarDate(snapshot.localDate),
      metric,
      kcal: finiteNumber(snapshot.kcal, "HealthKit kcal", 0, 50000),
      revision: safeInteger(snapshot.revision, "HealthKit revision", 1, Number.MAX_SAFE_INTEGER),
      sampleCount: safeInteger(snapshot.sampleCount, "HealthKit sample count", 0, 1_000_000),
      calculatedAt: snapshot.calculatedAt,
    };
  });
  return coalesceHealthKitEnergySnapshots(snapshots);
}

export function parseHealthKitUpload(value: unknown) {
  const body = record(value);
  const snapshots = Array.isArray(body.snapshots) && body.snapshots.length === 0
    ? []
    : body.snapshots === undefined ? [] : parseHealthKitEnergySnapshots({ snapshots: body.snapshots });
  if (!Array.isArray(body.bodyMassChanges) || body.bodyMassChanges.length > 100) {
    if (body.bodyMassChanges === undefined && snapshots.length) return { snapshots, bodyMassChanges: [] };
    throw new ValidationError("HealthKit body mass batch is invalid");
  }
  const bodyMassChanges = body.bodyMassChanges.map((raw): HealthKitBodyMassChange => {
    const change = record(raw);
    if (change.operation !== "upsert" && change.operation !== "delete") throw new ValidationError("HealthKit body mass operation is invalid");
    const sampleId = parseInstallationId(change.sampleId);
    if (change.operation === "delete") return { operation: "delete", sampleId };
    if (typeof change.occurredAt !== "string" || !Number.isFinite(Date.parse(change.occurredAt))) throw new ValidationError("HealthKit body mass time is invalid");
    const sourceBundle = typeof change.sourceBundle === "string" ? change.sourceBundle.slice(0, 255) : "";
    const sourceName = typeof change.sourceName === "string" ? change.sourceName.slice(0, 255) : "";
    const syncIdentifier = typeof change.syncIdentifier === "string" ? change.syncIdentifier.slice(0, 255) : undefined;
    const syncVersion = change.syncVersion === undefined ? undefined : safeInteger(change.syncVersion, "HealthKit sync version", 1, 2_147_483_647);
    return { operation: "upsert", sampleId, occurredAt: change.occurredAt, weightKg: normalizeWeightKg(finiteNumber(change.weightKg, "HealthKit body mass", 20, 500)), sourceBundle, sourceName, ...(syncIdentifier ? { syncIdentifier } : {}), ...(syncVersion ? { syncVersion } : {}) };
  });
  if (!snapshots.length && !bodyMassChanges.length) throw new ValidationError("HealthKit upload is empty");
  return { snapshots, bodyMassChanges };
}

export function coalesceHealthKitEnergySnapshots(snapshots: HealthKitEnergySnapshot[]) {
  const newest = new Map<string, HealthKitEnergySnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.localDate}:${snapshot.metric}`;
    const current = newest.get(key);
    if (!current || snapshot.revision > current.revision) newest.set(key, snapshot);
  }
  return [...newest.values()];
}

export function createNativeDeviceCredential() {
  return randomBytes(32).toString("base64url");
}

export function hashNativeDeviceCredential(credential: string) {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export function bearerCredential(header: string | null) {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}

export function hasHealthKitEnergyScope(scopes: unknown): scopes is string[] {
  return Array.isArray(scopes) && scopes.includes(HEALTHKIT_ENERGY_SCOPE);
}

export function nativeDeviceAccessStatus(device: NativeDeviceAccessRecord, requiredScope = HEALTHKIT_ENERGY_SCOPE): 200 | 401 | 403 {
  if (!device || device.revoked_at) return 401;
  return Array.isArray(device.scopes) && device.scopes.includes(requiredScope) ? 200 : 403;
}
