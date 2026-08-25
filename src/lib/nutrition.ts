import type { DailyNutritionSummary, DrinkLimit, DrinkLimitStatus, DrinkLog, EstimateConfidence, FoodLog, LimitState } from "./types";

function estimate(record: { estimatedKcal: number | null; kcalMin: number | null; kcalMax: number | null }) {
  const middle = record.estimatedKcal ?? (record.kcalMin !== null && record.kcalMax !== null ? Math.round((record.kcalMin + record.kcalMax) / 2) : record.kcalMin ?? record.kcalMax ?? 0);
  return { middle, min: record.kcalMin ?? middle, max: record.kcalMax ?? middle };
}

function overallConfidence(records: Array<{ confidence: EstimateConfidence }>): EstimateConfidence {
  if (!records.length || records.some((item) => item.confidence === "low")) return "low";
  return records.some((item) => item.confidence === "medium") ? "medium" : "high";
}

export function calculateDailyNutrition(date: string, foods: FoodLog[], drinks: DrinkLog[], settings: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string }): DailyNutritionSummary {
  const records = [...foods, ...drinks];
  const totals = records.reduce((sum, record) => {
    const value = estimate(record);
    return { middle: sum.middle + value.middle, min: sum.min + value.min, max: sum.max + value.max };
  }, { middle: 0, min: 0, max: 0 });
  const hasExpenditure = settings.restingEnergyKcal !== null || settings.activeEnergyKcal !== null;
  const expenditure = hasExpenditure ? (settings.restingEnergyKcal ?? 0) + (settings.activeEnergyKcal ?? 0) : null;
  return {
    date, estimatedIntakeKcal: Math.round(totals.middle), intakeMin: Math.round(totals.min), intakeMax: Math.round(totals.max),
    restingEnergyKcal: settings.restingEnergyKcal, activeEnergyKcal: settings.activeEnergyKcal, totalExpenditureKcal: expenditure,
    energyBalance: expenditure === null ? null : Math.round(totals.middle - expenditure),
    energyBalanceMin: expenditure === null ? null : Math.round(totals.min - expenditure),
    energyBalanceMax: expenditure === null ? null : Math.round(totals.max - expenditure),
    confidence: overallConfidence(records), notes: settings.notes,
  };
}

export function limitState(count: number, limit: number): LimitState {
  if (count > limit) return "exceeded_limit";
  if (count === limit) return "reached_limit";
  if (count === Math.max(0, limit - 1)) return "near_limit";
  return "within_limit";
}

export function drinkMatchesLimit(drink: DrinkLog, limit: DrinkLimit) {
  const target = limit.targetType.toLocaleLowerCase();
  return drink.drinkType === target || drink.name.toLocaleLowerCase().includes(target);
}

export function calculateLimitStatus(limit: DrinkLimit, drinks: DrinkLog[]): DrinkLimitStatus {
  const count = drinks.filter((drink) => drinkMatchesLimit(drink, limit)).length;
  return { limit, count, state: limitState(count, limit.limitValue) };
}
