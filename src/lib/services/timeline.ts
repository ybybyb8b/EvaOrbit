import "server-only";

import { calculateDailyNutrition } from "../nutrition";
import { getRepository } from "../repositories";
import { buildTimelineEvents } from "../timeline";
import { dateInEvaOrbit, dateRange } from "../time";

async function loadDailySources(date: string) {
  const repository = await getRepository();
  const range = dateRange(date);
  const [foods, drinks, trackerEntries, trackers] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
  ]);
  return { repository, foods, drinks, trackerEntries, trackers };
}

export async function listTimeline(input: { date?: string; limit?: number } = {}) {
  const date = input.date ?? dateInEvaOrbit();
  const { foods, drinks, trackerEntries, trackers } = await loadDailySources(date);
  return buildTimelineEvents(foods, drinks, trackerEntries, trackers).slice(0, Math.max(1, Math.min(input.limit ?? 100, 100)));
}

export async function getDailyTimelineOverview(date = dateInEvaOrbit()) {
  const repository = await getRepository();
  const range = dateRange(date);
  const [foods, drinks, trackerEntries, trackers, nutritionSettings] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.getNutritionSettings(date),
  ]);
  return {
    date,
    events: buildTimelineEvents(foods, drinks, trackerEntries, trackers),
    mealTypes: foods.map((item) => item.mealType),
    drinkCount: drinks.length,
    nutrition: calculateDailyNutrition(date, foods, drinks, nutritionSettings),
  };
}
