import type { CatMeasurement, CatTimelineEntry } from "./types.ts";

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
