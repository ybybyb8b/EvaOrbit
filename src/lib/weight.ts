import { dateInEvaOrbit, shiftDate, zonedDateParts, zonedDateTimeToUtc } from "./time.ts";
import type { WeightRecord, WeightSettings } from "./types.ts";

export type WeightRange = "7d" | "30d" | "90d" | "1y" | "all";

export function weightRecordsInRange(records: WeightRecord[], range: WeightRange, now = new Date()) {
  if (range === "all") return records;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const from = shiftDate(dateInEvaOrbit(now), -(days - 1));
  return records.filter((record) => dateInEvaOrbit(new Date(record.occurredAt)) >= from);
}

export function weightTrend(records: WeightRecord[]) {
  const days = new Map<string, number[]>();
  for (const record of records) {
    const date = dateInEvaOrbit(new Date(record.occurredAt));
    days.set(date, [...(days.get(date) ?? []), record.weightKg]);
  }
  const daily = [...days].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, weightKg: values.reduce((sum, value) => sum + value, 0) / values.length }));
  return daily.map((point, index) => {
    const from = shiftDate(point.date, -6);
    const window = daily.slice(0, index + 1).filter((item) => item.date >= from);
    return { ...point, movingAverageKg: window.reduce((sum, item) => sum + item.weightKg, 0) / window.length };
  });
}

export function weightReminderSchedules(settings: WeightSettings, records: Pick<WeightRecord, "occurredAt">[], now = new Date(), days = 7) {
  if (!settings.reminderEnabled) return [];
  const recorded = new Set(records.map((record) => zonedDateParts(record.occurredAt).date));
  const today = dateInEvaOrbit(now);
  return Array.from({ length: days }, (_, offset) => shiftDate(today, offset)).flatMap((date) => {
    const triggerAt = zonedDateTimeToUtc(date, settings.reminderTime);
    return recorded.has(date) || new Date(triggerAt) <= now ? [] : [{ date, triggerAt }];
  });
}

export function weightReminderWindow(settings:WeightSettings,date:string,now=new Date()){
  if(!settings.reminderEnabled)return null;const scheduledAt=zonedDateTimeToUtc(date,settings.reminderTime);const elapsed=now.getTime()-new Date(scheduledAt).getTime();
  return elapsed>=0&&elapsed<2*60*60_000?{scheduledAt,from:zonedDateTimeToUtc(date,"00:00"),to:zonedDateTimeToUtc(shiftDate(date,1),"00:00")}:null;
}
