import "server-only";
import type { EvaOrbitRepository } from "../repositories/types";
import type { FoodLog } from "../types";
import { dateInEvaOrbit, dateRange } from "../time";
import { resolveMealTimes } from "../meal-calendar";

export async function withMealTimes(repository: EvaOrbitRepository, records: FoodLog[]) {
  if (!records.length) return records;
  const settings = await repository.getCalendarInterpretation();
  const dates = [...new Set(records.map(record => dateInEvaOrbit(new Date(record.occurredAt))))];
  const resolved = await Promise.all(dates.map(async date => {
    const range = dateRange(date);
    const [foods, calendar] = await Promise.all([repository.listFoodLogs(range), repository.listCalendarEvents({ ...range, limit: 500 })]);
    // Match against the whole day, not a filtered search result; otherwise competing meals disappear.
    return resolveMealTimes(foods, calendar, settings);
  }));
  const byId = new Map(resolved.flat().map(record => [record.id, record]));
  return records.map(record => byId.get(record.id) ?? record);
}
