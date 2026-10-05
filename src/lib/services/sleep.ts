import "server-only";
import { usesSupabase } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import { dateRange, shiftDate } from "../time";
import type { SleepSample } from "../sleep";
import { buildDailySleepSummary } from "../sleep";
import { summarizeCalendarActivity } from "../home-day";
import { getRepository } from "../repositories";

export async function getHealthKitSleepSamples(date: string): Promise<SleepSample[]> {
  if (!usesSupabase()) return [];
  const client = await createSupabaseServerClient();
  const from = dateRange(shiftDate(date, -2)).from, to = dateRange(shiftDate(date, 2)).to;
  const rows: SleepSample[] = [];
  // Complete pagination: stage samples can exceed Supabase's default 1000-row response limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("healthkit_read_samples")
      .select("sample_id,start_at,end_at,time_zone,time_zone_source,stage,source_bundle,source_name,sync_identifier,sync_version,installation_id")
      .eq("metric", "sleep").eq("deleted", false).lt("start_at", to).gt("end_at", from)
      .order("sample_id").order("installation_id").range(offset, offset + 499);
    // Compatible Web can precede migration: only missing relation is an empty source, never swallow other failures.
    if (error?.code === "42P01" || error?.code === "PGRST205") return [];
    if (error) throw new Error("Could not read Apple Health sleep");
    rows.push(...(data ?? []).map(row => ({
      sampleId: String(row.sample_id), startAt: String(row.start_at), endAt: String(row.end_at),
      timeZone: String(row.time_zone), timeZoneSource: row.time_zone_source as SleepSample["timeZoneSource"],
      stage: Number(row.stage), sourceBundle: String(row.source_bundle ?? ""), sourceName: String(row.source_name ?? "Apple Health"),
      ...(row.sync_identifier ? { syncIdentifier: String(row.sync_identifier) } : {}), ...(row.sync_version ? { syncVersion: Number(row.sync_version) } : {}),
    })));
    if (!data || data.length < 500) return rows;
  }
}

export async function getDailySleepSummary(date: string) {
  const repository = await getRepository();
  const range = dateRange(date);
  const [samples, events, interpretation] = await Promise.all([
    getHealthKitSleepSamples(date),
    repository.listCalendarEvents({ from: range.from, to: range.to, status: "confirmed", limit: 500 }),
    repository.getCalendarInterpretation(),
  ]);
  return buildDailySleepSummary(date, samples, summarizeCalendarActivity(events, date, interpretation).sleep);
}
