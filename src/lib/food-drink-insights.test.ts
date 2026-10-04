import assert from "node:assert/strict";
import test from "node:test";
import { buildFoodDrinkInsights } from "./food-drink-insights.ts";
import type { FoodLog, DrinkLog } from "./types.ts";

const today = "2026-10-04";
const food = (id: number, extra: Partial<FoodLog> = {}): FoodLog => ({ id, title: "面条", occurredAt: `${today}T12:00:00+08:00`, mealType: "lunch", scene: "home", ...extra } as FoodLog);
const drink = (id: number, extra: Partial<DrinkLog> = {}): DrinkLog => ({ id, name: "茶", brand: "", drinkType: "tea", occurredAt: `${today}T14:00:00+08:00`, sugarLevel: "", temperature: null, rating: null, ...extra } as DrinkLog);

test("sparse records produce no manufactured insights; future and old records are excluded", () => {
  const rows = [food(1), food(2), food(3, { occurredAt: "2026-10-05T12:00:00+08:00" }), food(4, { occurredAt: "2026-09-01T12:00:00+08:00" })];
  assert.deepEqual(buildFoodDrinkInsights(rows, [], today), []);
});

test("meaningful changes require a recorded baseline and complete comparison window", () => {
  const current = Array.from({ length: 6 }, (_, id) => food(id));
  const previous = Array.from({ length: 3 }, (_, id) => food(id + 10, { occurredAt: "2026-09-25T12:00:00+08:00" }));
  assert.match(buildFoodDrinkInsights([...current, ...previous], [], today).find(row => row.id === "change-meals")!.body, /6 次，前 7 天 3 次/);
  for (const rows of [buildFoodDrinkInsights(current, [], today), buildFoodDrinkInsights([...current, ...previous], [], today, false)]) {
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => !row.id.startsWith("change-")));
  }
});

test("shortlist combines preference changes, linked places, food and drink without health metrics", () => {
  const foods = [food(1), food(2), food(3, { title: "米饭" })].map(row => ({ ...row, foodPlaceId: 7, foodPlaceName: "共享来源" }));
  const drinks = Array.from({ length: 4 }, (_, id) => drink(id, { name: "", drinkMenuName: "桂花茶", sugarLevel: "无糖", foodPlaceId: 7, foodPlaceName: "共享来源" }));
  const oldDrinks = Array.from({ length: 3 }, (_, id) => drink(id + 20, { occurredAt: "2026-09-25T14:00:00+08:00", sugarLevel: "全糖" }));
  const result = buildFoodDrinkInsights(foods, [...drinks, ...oldDrinks], today);
  assert.ok(result.length >= 3 && result.length <= 5);
  assert.equal(new Set(result.map(row => row.id)).size, result.length);
  assert.match(result.find(row => row.id === "preference-sugarLevel")!.title, /全糖.*无糖/);
  assert.match(result.find(row => row.id === "place-combo-7")!.body, /3 条 Food、4 条 Drink/);
  assert.ok(result.some(row => row.title.includes("桂花茶")));
  assert.deepEqual(buildFoodDrinkInsights(foods.map(row => ({ ...row, estimatedKcal: 9000 })), [...drinks, ...oldDrinks].map(row => ({ ...row, caffeineMg: 500, estimatedKcal: 999 })), today), result);
  assert.ok(buildFoodDrinkInsights(foods, [...drinks, ...oldDrinks], today, false).every(row => !row.title.includes("转向")));
});
