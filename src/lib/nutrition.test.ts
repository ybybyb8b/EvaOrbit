import assert from "node:assert/strict";
import test from "node:test";
import { calculateDailyNutrition, calculateLimitStatus, limitState } from "./nutrition.ts";
import type { DrinkLimit, DrinkLog, FoodLog } from "./types.ts";

const food = (values: Partial<FoodLog>): FoodLog => ({ id: 1, occurredAt: "2026-08-25T04:00:00.000Z", mealType: "lunch", title: "午饭", description: "", portion: "", scene: "home", estimatedKcal: null, kcalMin: null, kcalMax: null, confidence: "medium", notes: "", imageUrl: null, attachmentId: null, createdAt: "", updatedAt: "", ...values });
const drink = (values: Partial<DrinkLog>): DrinkLog => ({ id: 1, occurredAt: "2026-08-25T05:00:00.000Z", name: "拿铁", brand: "", drinkType: "coffee", volumeMl: 350, sugarLevel: "", caffeineMg: null, estimatedKcal: null, kcalMin: null, kcalMax: null, confidence: "high", foodLibraryId: null, notes: "", createdAt: "", updatedAt: "", ...values });

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

test("reports drink limit states factually", () => {
  assert.equal(limitState(2, 3), "near_limit");
  assert.equal(limitState(3, 3), "reached_limit");
  assert.equal(limitState(4, 3), "exceeded_limit");
  const limit: DrinkLimit = { id: 1, name: "本周咖啡", targetType: "coffee", period: "weekly", limitValue: 2, enabled: true, createdAt: "", updatedAt: "" };
  const status = calculateLimitStatus(limit, [drink({ id: 1 }), drink({ id: 2, name: "美式" }), drink({ id: 3, name: "茶", drinkType: "tea" })]);
  assert.deepEqual({ count: status.count, state: status.state }, { count: 2, state: "reached_limit" });
});
