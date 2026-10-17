import type { CatMeasurement, CatTimelineEntry } from "./types.ts";
import { addCalendarInterval, dateInEvaOrbit } from "./time.ts";

export function catAgeLabel(birthday: string | null, english = false, today = dateInEvaOrbit()) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || birthday > today) return null;
  const date = new Date(`${birthday}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthday) return null;
  const [bornYear, bornMonth] = birthday.split("-").map(Number);
  const [year, month] = today.split("-").map(Number);
  let totalMonths = (year - bornYear) * 12 + month - bornMonth;
  if (addCalendarInterval(birthday, totalMonths, "month") > today) totalMonths--;
  if (!totalMonths) return english ? "Under 1 month" : "未满1个月";
  const years = Math.floor(totalMonths / 12), months = totalMonths % 12;
  return english
    ? [years ? `${years} ${years === 1 ? "year" : "years"}` : "", months ? `${months} ${months === 1 ? "month" : "months"}` : ""].filter(Boolean).join(" ")
    : `${years ? `${years}岁` : ""}${months ? `${months}个月` : ""}`;
}

/** Keep the latest completion of each routine; manual and one-time records stay independent. */
export function latestCatRecords(items: CatTimelineEntry[]) {
  const latest = new Map<string, CatTimelineEntry>();
  for (const item of items) {
    if (item.kind !== "event" || item.metadata.sourceType !== "cat_routine" || !item.metadata.sourceId) continue;
    const key = `${item.petId}:${item.metadata.sourceId}`;
    const previous = latest.get(key);
    if (!previous || item.occurredAt > previous.occurredAt || (item.occurredAt === previous.occurredAt && item.id > previous.id)) latest.set(key, item);
  }
  return items.filter(item => item.kind !== "event" || item.metadata.sourceType !== "cat_routine" || !item.metadata.sourceId || latest.get(`${item.petId}:${item.metadata.sourceId}`) === item);
}

export function latestCatMeasurements(items: CatMeasurement[]) {
  const latest = new Map<string, CatMeasurement>();
  for (const item of [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id)) {
    const key = `${item.measurementType.trim().toLowerCase()}:${item.unit.trim().toLowerCase()}`;
    if (!latest.has(key)) latest.set(key, item);
  }
  return [...latest.values()];
}

export function isCatHealthRecord(item: CatTimelineEntry) {
  return item.kind !== "event" || item.eventType === "deworming";
}
