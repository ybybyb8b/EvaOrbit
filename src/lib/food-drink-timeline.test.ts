import assert from "node:assert/strict";
import test from "node:test";
import { foodDrinkTimeline, foodDrinkOverview } from "./food-drink-timeline.ts";
import type { FoodLog, DrinkLog } from "./types";

const food = (id: number, occurredAt: string, extra: Partial<FoodLog> = {}): FoodLog => ({ id, occurredAt, occurredHasExplicitTime: true, mealType: "lunch", scene: "home", estimatedKcal: null, kcalMin: null, kcalMax: null, ...extra } as FoodLog);
const drink = (id: number, occurredAt: string, extra: Partial<DrinkLog> = {}): DrinkLog => ({ id, occurredAt, occurredHasExplicitTime: true, estimatedKcal: null, kcalMin: null, kcalMax: null, ...extra } as DrinkLog);

test("mixed timeline sorts actual instants and keeps overlapping source IDs independent", () => {
  const records = foodDrinkTimeline([food(1, "2026-10-04T12:00:00+08:00")], [drink(1, "2026-10-04T03:00:00Z")]);
  assert.deepEqual(records.map(entry => entry.kind + ":" + entry.record.id), ["drink:1", "food:1"]);
});
test("date-only records retain their day without masquerading as a timed event", () => {
  const records = foodDrinkTimeline([food(1, "2026-10-04T04:00:00Z", { occurredHasExplicitTime: false }), food(2, "2026-10-05T04:00:00Z", { occurredHasExplicitTime: false })], [drink(1, "2026-10-04T14:00:00Z")]);
  assert.deepEqual(records.map(entry => entry.kind + ":" + entry.record.id), ["drink:1", "food:1", "food:2"]);
  assert.deepEqual(foodDrinkTimeline(records.filter(entry => entry.kind === "food").map(entry => entry.record), [drink(1, "2026-10-04T14:00:00Z")], true).map(entry => entry.kind + ":" + entry.record.id), ["food:2", "drink:1", "food:1"]);
});
test("overview counts meal categories once and does not classify unknown calories as zero", () => {
  const summary = foodDrinkOverview([food(1, "2026-10-04T04:00:00Z", { scene: "delivery", estimatedKcal: 400 }), food(2, "2026-10-04T04:00:00Z"), food(3, "2026-10-04T10:00:00Z", { mealType: "dinner", scene: "restaurant", kcalMin: 300, kcalMax: 500 })], [drink(1, "2026-10-04T06:00:00Z", { estimatedKcal: 0 })]);
  assert.deepEqual(summary, { meals: 2, drinks: 1, outsideMeals: 2, unestimated: 1 });
  assert.deepEqual(foodDrinkOverview([], []), { meals: 0, drinks: 0, outsideMeals: 0, unestimated: 0 });
});
