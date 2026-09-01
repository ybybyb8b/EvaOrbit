import "server-only";
import { getRepository } from "../repositories";
import { calculateDailyNutrition, resolveEnergyMetric } from "../nutrition";
import type { DailyNutritionSummary, DrinkLog, FoodLog } from "../types";
import { listDrinkLogs } from "./drink";
import { listFoodLogs } from "./food";
import { dateInEvaOrbit, dateRange } from "../time";
import { getHealthKitDailyEnergy, listHealthKitDailyEnergy, type HealthKitDailyEnergy } from "./healthkit";

function withEnergySources(
  date: string,
  foods: FoodLog[],
  drinks: DrinkLog[],
  manual: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string },
  healthKit: HealthKitDailyEnergy | null,
): DailyNutritionSummary {
  const resting = resolveEnergyMetric(manual.restingEnergyKcal, healthKit?.restingEnergyKcal);
  const active = resolveEnergyMetric(manual.activeEnergyKcal, healthKit?.activeEnergyKcal);
  return {
    ...calculateDailyNutrition(date, foods, drinks, { restingEnergyKcal: resting.value, activeEnergyKcal: active.value, notes: manual.notes }),
    manualRestingEnergyKcal: manual.restingEnergyKcal,
    manualActiveEnergyKcal: manual.activeEnergyKcal,
    healthKitRestingEnergyKcal: healthKit?.restingEnergyKcal ?? null,
    healthKitActiveEnergyKcal: healthKit?.activeEnergyKcal ?? null,
    restingEnergySource: resting.source,
    activeEnergySource: active.source,
    healthKitLastIngestedAt: healthKit?.lastIngestedAt ?? null,
  };
}

export async function getDailyNutritionSummary(date = dateInEvaOrbit()) {
  const repository = await getRepository();
  const [foods, drinks, settings, healthKit] = await Promise.all([listFoodLogs({ date }), listDrinkLogs({ date }), repository.getNutritionSettings(date), getHealthKitDailyEnergy(date)]);
  return withEnergySources(date, foods, drinks, settings, healthKit);
}

export async function listDailyNutritionHistory(limit = 30): Promise<DailyNutritionSummary[]> {
  const repository = await getRepository();
  const [settings, healthKitRows] = await Promise.all([repository.listNutritionSettings(limit), listHealthKitDailyEnergy(limit)]);
  if (!settings.length && !healthKitRows.length) return [];

  const dates = [...new Set([...settings.map((item) => item.date), ...healthKitRows.map((item) => item.localDate)])].sort((a, b) => b.localeCompare(a)).slice(0, limit);
  const from = dateRange(dates.reduce((earliest, date) => date < earliest ? date : earliest)).from;
  const to = dateRange(dates.reduce((latest, date) => date > latest ? date : latest)).to;
  const [foods, drinks] = await Promise.all([listFoodLogs({ from, to }), listDrinkLogs({ from, to })]);
  const foodsByDate = groupLogsByDate(foods);
  const drinksByDate = groupLogsByDate(drinks);

  const manualByDate = new Map(settings.map((item) => [item.date, item]));
  const healthKitByDate = new Map(healthKitRows.map((item) => [item.localDate, item]));
  return dates.map((date) => withEnergySources(
    date,
    foodsByDate.get(date) ?? [],
    drinksByDate.get(date) ?? [],
    manualByDate.get(date) ?? { restingEnergyKcal: null, activeEnergyKcal: null, notes: "" },
    healthKitByDate.get(date) ?? null,
  ));
}

function groupLogsByDate<T extends FoodLog | DrinkLog>(records: T[]) {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const date = dateInEvaOrbit(new Date(record.occurredAt));
    const bucket = grouped.get(date);
    if (bucket) bucket.push(record);
    else grouped.set(date, [record]);
  }
  return grouped;
}

export async function updateDailyEnergy(date: string, input: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string }) {
  await (await getRepository()).updateNutritionSettings(date, input);
  return getDailyNutritionSummary(date);
}
