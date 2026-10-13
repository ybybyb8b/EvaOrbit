import "server-only";
import { usesSupabase } from "../config";
import { dateRange, shiftDate } from "../time";
import type { SleepSample } from "../sleep";
import { buildDailySleepSummary, firstSleepWakeDate } from "../sleep";
import { summarizeCalendarActivity } from "../home-day";
import { getRepository } from "../repositories";

export async function getHealthKitSleepSamples(date: string): Promise<SleepSample[]> {
  if (!usesSupabase() || date < firstSleepWakeDate) return [];
  const from = dateRange(shiftDate(date, -2)).from, to = dateRange(shiftDate(date, 2)).to;
  return (await getRepository()).listSleepSamples({ from, to });
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
