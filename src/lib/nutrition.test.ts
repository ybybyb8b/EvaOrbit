import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateDailyNutrition, calculateLimitStatus, limitState, resolveEnergyMetric } from "./nutrition.ts";
import type { DrinkLimit, DrinkLog, FoodLog } from "./types.ts";

const food = (values: Partial<FoodLog>): FoodLog => ({ id: 1, occurredAt: "2026-08-25T04:00:00.000Z", mealType: "lunch", title: "午饭", description: "", portion: "", scene: "home", estimatedKcal: null, kcalMin: null, kcalMax: null, confidence: "medium", notes: "", imageUrl: null, attachmentId: null, createdAt: "", updatedAt: "", ...values, rating: values.rating ?? null });
const drink = (values: Partial<DrinkLog>): DrinkLog => ({ id: 1, occurredAt: "2026-08-25T05:00:00.000Z", name: "拿铁", brand: "", drinkType: "coffee", volumeMl: 350, sugarLevel: "", caffeineMg: null, estimatedKcal: null, kcalMin: null, kcalMax: null, confidence: "high", foodLibraryId: null, notes: "", createdAt: "", updatedAt: "", ...values, occurredHasExplicitTime: values.occurredHasExplicitTime ?? true, temperature: values.temperature ?? null, rating: values.rating ?? null });

test("sums food and drink estimates while preserving uncertainty range", () => {
  const result = calculateDailyNutrition("2026-08-25", [food({ estimatedKcal: 500, kcalMin: 430, kcalMax: 620 })], [drink({ estimatedKcal: 180, kcalMin: 150, kcalMax: 220 })], { restingEnergyKcal: 1500, activeEnergyKcal: 300, notes: "" });
  assert.deepEqual({ estimate: result.estimatedIntakeKcal, min: result.intakeMin, max: result.intakeMax }, { estimate: 680, min: 580, max: 840 });
  assert.deepEqual({ balance: result.energyBalance, min: result.energyBalanceMin, max: result.energyBalanceMax }, { balance: -1120, min: -1220, max: -960 });
  assert.equal(result.confidence, "medium");
});

test("does not invent expenditure when no expenditure settings exist", () => {
  const result = calculateDailyNutrition("2026-08-25", [], [], { restingEnergyKcal: null, activeEnergyKcal: null, notes: "" });
  assert.equal(result.totalExpenditureKcal, null);
  assert.equal(result.energyBalance, null);
  assert.equal(result.confidence, "low");
});

test("manual daily energy remains an explicit override over Apple Health", () => {
  assert.deepEqual(resolveEnergyMetric(1550, 1490), { value: 1550, source: "manual" });
  assert.deepEqual(resolveEnergyMetric(null, 1490), { value: 1490, source: "apple_health" });
  assert.deepEqual(resolveEnergyMetric(null, null), { value: null, source: null });
});

test("reports drink limit states factually", () => {
  assert.equal(limitState(2, 3), "near_limit");
  assert.equal(limitState(3, 3), "reached_limit");
  assert.equal(limitState(4, 3), "exceeded_limit");
  const limit: DrinkLimit = { id: 1, name: "本周咖啡", targetType: "coffee", period: "weekly", limitValue: 2, enabled: true, createdAt: "", updatedAt: "" };
  const status = calculateLimitStatus(limit, [drink({ id: 1 }), drink({ id: 2, name: "美式" }), drink({ id: 3, name: "茶", drinkType: "tea" })]);
  assert.deepEqual({ count: status.count, state: status.state }, { count: 2, state: "reached_limit" });
});

test("nutrition history uses saved settings and one range per log source", () => {
  const service = readFileSync(new URL("./services/nutrition.ts", import.meta.url), "utf8");
  const sqlite = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const historyRoute = readFileSync(new URL("../app/api/nutrition/daily/history/route.ts", import.meta.url), "utf8");
  assert.match(service, /repository\.listNutritionSettings\(limit\)/);
  assert.match(service, /listFoodLogs\(\{ from, to \}\)/);
  assert.match(service, /listDrinkLogs\(\{ from, to \}\)/);
  assert.match(service, /dateInEvaOrbit\(new Date\(record\.occurredAt\)\)/);
  assert.match(sqlite, /listNutritionSettings\(limit=30\)/);
  assert.match(sqlite, /resting_energy_kcal IS NOT NULL OR active_energy_kcal IS NOT NULL/);
  assert.match(historyRoute, /listDailyNutritionHistory/);
  assert.match(historyRoute, /limit > 90/);
});
