import type { FoodLog, DrinkLog } from "./types";
import { dateInEvaOrbit } from "./time.ts";

export type FoodDrinkEntry = { kind: "food"; record: FoodLog } | { kind: "drink"; record: DrinkLog };

export function foodDrinkTimeline(foods: FoodLog[], drinks: DrinkLog[], newestFirst = false): FoodDrinkEntry[] {
  const entries: FoodDrinkEntry[] = [...foods.map(record => ({ kind: "food" as const, record })), ...drinks.map(record => ({ kind: "drink" as const, record }))];
  return entries.sort((a, b) => {
    const day = dateInEvaOrbit(new Date(a.record.occurredAt)).localeCompare(dateInEvaOrbit(new Date(b.record.occurredAt)));
    if (day) return newestFirst ? -day : day;
    // Date-only anchors are storage details, not known times. Keep them after timed entries.
    const untimedA = a.record.occurredHasExplicitTime === false;
    const untimedB = b.record.occurredHasExplicitTime === false;
    if (untimedA !== untimedB) return untimedA ? 1 : -1;
    const time = untimedA ? 0 : Date.parse(a.record.occurredAt) - Date.parse(b.record.occurredAt);
    return (newestFirst ? -time : time) || a.kind.localeCompare(b.kind) || a.record.id - b.record.id;
  });
}

export function foodDrinkOverview(foods: FoodLog[], drinks: DrinkLog[]) {
  const records = [...foods, ...drinks];
  return {
    meals: new Set(foods.map(record => record.mealType)).size,
    drinks: drinks.length,
    outsideMeals: foods.filter(record => record.scene === "delivery" || record.scene === "restaurant").length,
    unestimated: records.filter(record => record.estimatedKcal === null && record.kcalMin === null && record.kcalMax === null).length,
  };
}
