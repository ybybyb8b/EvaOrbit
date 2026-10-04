import assert from "node:assert/strict";
import test from "node:test";
import { buildFoodDrinkInsights } from "./food-drink-insights.ts";
import { shiftDate } from "./time.ts";
import type { FoodLog, DrinkLog } from "./types.ts";

const today = "2026-10-04";
const at = (offset: number) => `${shiftDate(today, -offset)}T12:00:00+08:00`;
const food = (id: number, extra: Partial<FoodLog> = {}): FoodLog => ({ id, title: "面条", occurredAt: at(id % 3), mealType: "lunch", scene: "home", ...extra } as FoodLog);
const drink = (id: number, extra: Partial<DrinkLog> = {}): DrinkLog => ({ id, name: "茶", brand: "", drinkType: "tea", occurredAt: at(id % 3), sugarLevel: "", temperature: null, rating: null, ...extra } as DrinkLog);

test("sparse records produce no manufactured insights; future and old records are excluded", () => {
  const rows = [food(1), food(2), food(3, { occurredAt: at(-1) }), food(4, { occurredAt: at(31) })];
  assert.deepEqual(buildFoodDrinkInsights(rows, [], today), []);
});

test("frequency changes use two weeks of their own record kind and distributed evidence", () => {
  const current = Array.from({ length: 6 }, (_, id) => food(id, { scene: "delivery" }));
  const previous = Array.from({ length: 3 }, (_, id) => food(id + 10, { scene: "delivery", occurredAt: at(8 + id) }));
  const result = buildFoodDrinkInsights([...current, ...previous], [], today);
  assert.equal(result.find(row => row.id === "change-delivery")!.title, "最近更常点外卖");
  assert.match(result.find(row => row.id === "change-delivery")!.body, /6 次，前 7 天 3 次/);
  assert.ok(result.every(row => !row.body.includes("只比较")));
  for (const rows of [buildFoodDrinkInsights(current, [], today), buildFoodDrinkInsights([...current, ...previous], [], today, false), buildFoodDrinkInsights(current, previous.map(row => drink(row.id, { occurredAt: row.occurredAt })), today), buildFoodDrinkInsights([...current.map(row => ({ ...row, occurredAt: at(0) })), ...previous], [], today)]) {
    assert.ok(rows.every(row => !row.id.startsWith("change-")));
  }
});

test("preferences use recent filled records in 30 days and coexist with linked Places", () => {
  const foods = [food(1), food(2), food(3)].map(row => ({ ...row, foodPlaceId: 7, foodPlaceName: "共享来源" }));
  const drinks = Array.from({ length: 10 }, (_, id) => drink(id, { name: "", drinkMenuName: "桂花茶", sugarLevel: "无糖", foodPlaceId: 7, foodPlaceName: "共享来源" }));
  const oldDrinks = Array.from({ length: 6 }, (_, id) => drink(id + 20, { occurredAt: at(10 + id), sugarLevel: "全糖" }));
  const result = buildFoodDrinkInsights(foods, [...drinks, ...oldDrinks], today);
  assert.ok(result.length >= 3 && result.length <= 5);
  assert.equal(new Set(result.map(row => row.id)).size, result.length);
  assert.match(result.find(row => row.id === "preference-sugarLevel")!.body, /最近 10 杯.*无糖.*此前 6 杯.*全糖/);
  assert.match(result.find(row => row.id === "place-combo-7")!.body, /近 30 天 3 条饮食、10 杯饮品/);
  assert.ok(result.some(row => row.title.includes("桂花茶")));
  assert.deepEqual(buildFoodDrinkInsights(foods.map(row => ({ ...row, estimatedKcal: 9000 })), [...drinks, ...oldDrinks].map(row => ({ ...row, caffeineMg: 500, estimatedKcal: 999 })), today), result);
  assert.ok(buildFoodDrinkInsights(foods, [...drinks, ...oldDrinks], today, false).every(row => !row.body.includes("此前")));
});

test("two Place records or a single-day batch are not a frequent Place", () => {
  const rows = Array.from({ length: 6 }, (_, id) => food(id, { foodPlaceId: 7, foodPlaceName: "来源", occurredAt: at(id % 4) }));
  assert.ok(buildFoodDrinkInsights(rows.slice(0, 2), [drink(10)], today).every(row => !row.id.startsWith("place-")));
  assert.ok(buildFoodDrinkInsights(rows.map(row => ({ ...row, occurredAt: at(0) })), [], today).every(row => !row.id.startsWith("place-")));
  assert.equal(buildFoodDrinkInsights(rows.slice(0, 4), [], today).find(row => row.id === "place-repeat-7")!.title, "最近又选了「来源」");
  assert.match(buildFoodDrinkInsights(rows, [], today).find(row => row.id === "place-repeat-7")!.title, /常用来源/);
});

test("30-day preferences remain useful without records in the last week; tiny preferences stay hidden", () => {
  const rows = Array.from({ length: 6 }, (_, id) => drink(id, { occurredAt: at(15 + id), drinkType: "coffee", sugarLevel: "无糖" }));
  const result = buildFoodDrinkInsights([], rows, today);
  assert.equal(result.find(row => row.id === "preference-drinkType")!.title, "最近更偏爱咖啡");
  assert.match(result.find(row => row.id === "preference-drinkType")!.body, /近 30 天/);
  assert.ok(buildFoodDrinkInsights([], rows.slice(0, 3), today).every(row => !row.id.startsWith("preference-")));
});

test("diversity counts stable entities, never free titles or meal renames", () => {
  const rows = Array.from({ length: 10 }, (_, id) => food(id, { title: `不同的标题 ${id}`, occurredAt: at(id % 5) }));
  const variety = (logs: FoodLog[]) => buildFoodDrinkInsights(logs, [], today).find(row => row.id === "variety");
  assert.equal(variety(rows), undefined);
  assert.equal(variety(rows.map(row => ({ ...row, foodLibraryId: 1 }))), undefined);
  const linked = rows.map((row, index) => ({ ...row, foodLibraryId: index % 5 + 1 }));
  assert.match(variety(linked)!.body, /近 30 天涉及 5 款/);
  assert.deepEqual(variety(linked.map(row => ({ ...row, title: "改了标题" }))), variety(linked));
  assert.equal(variety(linked.map(row => ({ ...row, occurredAt: at(0) }))), undefined);
});
