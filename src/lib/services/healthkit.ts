import "server-only";

import { createClient } from "@supabase/supabase-js";
import { allowedEmail, supabaseConfig, usesSupabase } from "../config";
import { HttpError } from "../errors";
import {
  HEALTHKIT_ENERGY_SCOPE,
  createNativeDeviceCredential,
  hashNativeDeviceCredential,
  nativeDeviceAccessStatus,
  type HealthKitEnergySnapshot,
} from "../healthkit";
import { createSupabaseServerClient } from "../supabase/server";

type Row = Record<string, unknown>;

async function requireWebUser() {
  if (!usesSupabase()) throw new Error("Native HealthKit registration requires Supabase");
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  const expectedEmail = allowedEmail();
  const email = data.user?.email?.toLocaleLowerCase() ?? "";
  if (error || !data.user || !expectedEmail || email !== expectedEmail) throw new HttpError("Unauthorized", 401);
  return { client, userId: data.user.id };
}

function adminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is required for HealthKit ingest");
  const { url } = supabaseConfig();
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function registerNativeDevice(installationId: string) {
  const { client } = await requireWebUser();
  const credential = createNativeDeviceCredential();
  const { error } = await client.rpc("register_native_device", {
    p_installation_id: installationId,
    p_token_hash: hashNativeDeviceCredential(credential),
  });
  if (error) throw new Error("Could not register native device");
  return { installationId, credential, scope: HEALTHKIT_ENERGY_SCOPE };
}

export async function revokeNativeDevice(installationId: string) {
  const { client } = await requireWebUser();
  const { error } = await client.rpc("revoke_native_device", { p_installation_id: installationId });
  if (error) throw new Error("Could not revoke native device");
  return { revoked: true };
}

export type NativeIngestResult =
  | { ok: false; status: 401 | 403 }
  | { ok: true; accepted: number; received: number };

export async function ingestHealthKitEnergy(
  installationId: string,
  credential: string,
  snapshots: HealthKitEnergySnapshot[],
): Promise<NativeIngestResult> {
  const client = adminClient();
  const tokenHash = hashNativeDeviceCredential(credential);
  const { data: device, error } = await client
    .from("native_devices")
    .select("id,user_id,scopes,revoked_at")
    .eq("installation_id", installationId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error("Could not authenticate native device");
  if (!device) return { ok: false, status: 401 };
  const accessStatus = nativeDeviceAccessStatus(device);
  if (accessStatus !== 200) return { ok: false, status: accessStatus };

  const { data, error: ingestError } = await client.rpc("ingest_healthkit_energy_snapshots", {
    p_user_id: String(device.user_id),
    p_snapshots: snapshots,
  });
  if (ingestError) throw new Error("Could not ingest HealthKit energy");
  await client.from("native_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  const result = (data ?? {}) as Row;
  return { ok: true, accepted: Number(result.accepted ?? 0), received: Number(result.received ?? snapshots.length) };
}

export type HealthKitDailyEnergy = {
  localDate: string;
  restingEnergyKcal: number | null;
  activeEnergyKcal: number | null;
  lastIngestedAt: string;
};

export async function getHealthKitDailyEnergy(localDate: string): Promise<HealthKitDailyEnergy | null> {
  if (!usesSupabase()) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("healthkit_daily_energy")
    .select("local_date,resting_energy_kcal,active_energy_kcal,last_ingested_at")
    .eq("local_date", localDate)
    .maybeSingle();
  if (error) throw new Error("Could not read Apple Health energy");
  return data ? {
    localDate: String(data.local_date),
    restingEnergyKcal: data.resting_energy_kcal === null ? null : Number(data.resting_energy_kcal),
    activeEnergyKcal: data.active_energy_kcal === null ? null : Number(data.active_energy_kcal),
    lastIngestedAt: String(data.last_ingested_at),
  } : null;
}

export async function listHealthKitDailyEnergy(limit = 30): Promise<HealthKitDailyEnergy[]> {
  if (!usesSupabase()) return [];
  const size = Math.min(Math.max(Math.trunc(limit), 1), 90);
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("healthkit_daily_energy")
    .select("local_date,resting_energy_kcal,active_energy_kcal,last_ingested_at")
    .order("local_date", { ascending: false })
    .limit(size);
  if (error) throw new Error("Could not read Apple Health energy history");
  return (data as Row[]).map((row) => ({
    localDate: String(row.local_date),
    restingEnergyKcal: row.resting_energy_kcal === null ? null : Number(row.resting_energy_kcal),
    activeEnergyKcal: row.active_energy_kcal === null ? null : Number(row.active_energy_kcal),
    lastIngestedAt: String(row.last_ingested_at),
  }));
}
