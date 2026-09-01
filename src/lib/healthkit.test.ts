import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HEALTHKIT_ENERGY_SCOPE,
  bearerCredential,
  createNativeDeviceCredential,
  hashNativeDeviceCredential,
  hasHealthKitEnergyScope,
  nativeDeviceAccessStatus,
  parseHealthKitEnergySnapshots,
  parseInstallationId,
} from "./healthkit.ts";
import { ValidationError } from "./validation.ts";

const validSnapshot = {
  localDate: "2026-09-01",
  metric: "active",
  kcal: 321.5,
  revision: 4,
  sampleCount: 19,
  calculatedAt: "2026-09-01T10:00:00.000Z",
};

test("native credential is opaque, hashed, and accepted only as a Bearer token", () => {
  const credential = createNativeDeviceCredential();
  assert.equal(credential.length, 43);
  assert.match(credential, /^[A-Za-z0-9_-]+$/);
  assert.match(hashNativeDeviceCredential(credential), /^[0-9a-f]{64}$/);
  assert.equal(bearerCredential(`Bearer ${credential}`), credential);
  assert.equal(bearerCredential(null), null);
  assert.equal(bearerCredential(`Basic ${credential}`), null);
  assert.equal(hasHealthKitEnergyScope([HEALTHKIT_ENERGY_SCOPE]), true);
  assert.equal(hasHealthKitEnergyScope([]), false);
  assert.equal(hasHealthKitEnergyScope(["tasks:write"]), false);
});

test("HealthKit ingest validates installation, metric, date, ranges and batch size", () => {
  assert.equal(parseInstallationId("946e6cf1-96f2-4e47-9d45-b0fab32db24d"), "946e6cf1-96f2-4e47-9d45-b0fab32db24d");
  assert.deepEqual(parseHealthKitEnergySnapshots({ snapshots: [validSnapshot] }), [validSnapshot]);
  assert.throws(() => parseInstallationId("device-1"), ValidationError);
  assert.throws(() => parseHealthKitEnergySnapshots({ snapshots: [] }), ValidationError);
  assert.throws(() => parseHealthKitEnergySnapshots({ snapshots: [{ ...validSnapshot, metric: "heart_rate" }] }), ValidationError);
  assert.throws(() => parseHealthKitEnergySnapshots({ snapshots: [{ ...validSnapshot, localDate: "2026-02-30" }] }), ValidationError);
  assert.throws(() => parseHealthKitEnergySnapshots({ snapshots: [{ ...validSnapshot, kcal: -1 }] }), ValidationError);
  assert.throws(() => parseHealthKitEnergySnapshots({ snapshots: [{ ...validSnapshot, revision: 0 }] }), ValidationError);
  assert.throws(() => parseHealthKitEnergySnapshots({ snapshots: Array.from({ length: 51 }, () => validSnapshot) }), ValidationError);
});

test("duplicate and out-of-order snapshots collapse to the newest revision", () => {
  const parsed = parseHealthKitEnergySnapshots({ snapshots: [
    validSnapshot,
    { ...validSnapshot, revision: 2, kcal: 100 },
    { ...validSnapshot, revision: 5, kcal: 400 },
    { ...validSnapshot, metric: "resting", revision: 1, kcal: 1400 },
    { ...validSnapshot, revision: 5, kcal: 400 },
  ] });
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.find((item) => item.metric === "active"), { ...validSnapshot, revision: 5, kcal: 400 });
});

test("native device access rejects revocation and wrong scope", () => {
  assert.equal(nativeDeviceAccessStatus(null), 401);
  assert.equal(nativeDeviceAccessStatus({ revoked_at: "2026-09-01T00:00:00Z", scopes: [HEALTHKIT_ENERGY_SCOPE] }), 401);
  assert.equal(nativeDeviceAccessStatus({ revoked_at: null, scopes: ["tasks:write"] }), 403);
  assert.equal(nativeDeviceAccessStatus({ revoked_at: null, scopes: [HEALTHKIT_ENERGY_SCOPE] }), 200);
});

test("HealthKit migration separates sources and enforces scope and revision idempotency", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202609010001_healthkit_energy.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.native_devices/i);
  assert.match(sql, /token_hash text not null unique/i);
  assert.match(sql, /healthkit:energy:write/);
  assert.match(sql, /create table if not exists public\.healthkit_daily_energy/i);
  assert.match(sql, /primary key\(user_id, local_date\)/i);
  assert.match(sql, /excluded\.resting_revision > public\.healthkit_daily_energy\.resting_revision/i);
  assert.match(sql, /excluded\.active_revision > public\.healthkit_daily_energy\.active_revision/i);
  assert.match(sql, /grant execute on function public\.ingest_healthkit_energy_snapshots\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.ingest_healthkit_energy_snapshots\(uuid, jsonb\) to authenticated/i);
  assert.match(sql, /healthkit_daily_energy_owner_select/);
});

test("native API surface keeps bearer ingest separate from Web-session registration", () => {
  const ingest = readFileSync(new URL("../app/api/healthkit/energy/ingest/route.ts", import.meta.url), "utf8");
  const devices = readFileSync(new URL("../app/api/native/devices/route.ts", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  const bridge = readFileSync(new URL("../../ios/EvaOrbitHost/Sources/NativeBridge.swift", import.meta.url), "utf8");
  assert.match(ingest, /bearerCredential/);
  assert.match(ingest, /status: 401/);
  assert.match(ingest, /result\.status === 403/);
  assert.match(devices, /registerNativeDevice/);
  assert.match(devices, /revokeNativeDevice/);
  assert.match(proxy, /\/api\/healthkit\/energy\/ingest/);
  assert.match(bridge, /message\.frameInfo\.isMainFrame/);
  assert.match(bridge, /hostConfiguration\.allows\(sourceURL\)/);
  assert.match(bridge, /supportedMethods/);
});
