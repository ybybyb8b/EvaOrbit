import assert from "node:assert/strict";
import test from "node:test";
import { calculateFoodKcal, foodCalculatedTotal, foodNutritionReference, snapshotFoodConsumptions } from "./food-calculation.ts";
import { parseFoodLogPatch, parseNewFoodLog } from "./validation.ts";
import type { FoodLibraryItem } from "./types.ts";

const item: FoodLibraryItem = { id: 1, name: "饼干", brand: "测试", category: "snack", defaultPortion: "", referenceType: "per_100g", referenceEnergyKj: null, referenceKcal: 530, servingWeight: 20, servingKcal: 106, dataSource: "package_label", notes: "", archivedAt: null, updatedAt: "" };
const reference = foodNutritionReference(item);

test("portions honor nutrition reference, decimals, servings, kJ and incompatible units", () => {
  assert.equal(calculateFoodKcal(reference, 18.6, "g"), 98.58);
  assert.equal(calculateFoodKcal(reference, 1.5, "serving"), 159);
  assert.equal(calculateFoodKcal(reference, 18.6, "ml"), null);
  assert.equal(calculateFoodKcal({ ...reference, referenceType: "per_100ml", referenceKcal: 40 }, 250, "ml"), 100);
  assert.equal(calculateFoodKcal({ ...reference, referenceType: "per_100ml" }, 1, "serving"), null);
  const serving = { ...reference, referenceType: "per_serving" as const };
  assert.equal(calculateFoodKcal(serving, 0.5, "serving"), 53);
  assert.equal(calculateFoodKcal(serving, 10, "g"), 53);
  assert.equal(calculateFoodKcal({ ...serving, servingWeight: 0 }, 10, "g"), null);
  assert.equal(calculateFoodKcal({ ...reference, referenceKcal: null, referenceEnergyKj: 418.4 }, 100, "g"), 100);
  assert.equal(calculateFoodKcal(reference, 0, "g"), 0);
  for (const quantity of [null, -1, NaN, Infinity]) assert.equal(calculateFoodKcal(reference, quantity, "g"), null);
  assert.equal(calculateFoodKcal({ ...reference, referenceKcal: null }, 10, "g"), null);
});

test("server snapshots ignore forged nutrition, survive library edits and do not fetch on history edits", async () => {
  const saved = await snapshotFoodConsumptions([{ foodLibraryId: 1, quantity: 18.6, unit: "g", nutritionReference: { ...reference, referenceKcal: 0 }, calculatedKcal: 0 }], [], async () => item);
  assert.equal(saved[0].calculatedKcal, 98.58);
  assert.deepEqual(saved[0].nutritionReference, reference);
  const noLookup = async () => { throw new Error("Historical edits must not reread nutrition"); };
  assert.deepEqual(await snapshotFoodConsumptions(saved, saved, noLookup), saved);
  const edited = await snapshotFoodConsumptions([{ foodLibraryId: 1, quantity: 40, unit: "g" }], saved, noLookup);
  assert.equal(edited[0].calculatedKcal, 212);
  assert.equal(foodCalculatedTotal([...saved, ...edited]), 311);
  assert.equal(foodCalculatedTotal([{ foodLibraryId: 1, quantity: null, unit: "g", calculatedKcal: null }]), null);
  assert.equal(foodCalculatedTotal([]), null);
  await assert.rejects(() => snapshotFoodConsumptions(saved, [], async () => null), /不存在/);
  await assert.rejects(() => snapshotFoodConsumptions(saved, [], async () => ({ ...item, archivedAt: "archived" })), /归档/);
});

test("portion validation rejects duplicates, invalid quantities and forged snapshot fields", () => {
  const input = { foodLibraryId: 1, quantity: 18.6, unit: "g" };
  const parsed = parseNewFoodLog({ title: "食品", foodLibraryItems: [{ ...input, calculatedKcal: 900 }], foodKcalMode: "auto" });
  assert.deepEqual(parsed.foodLibraryItems, [input]);
  assert.deepEqual(parseFoodLogPatch({ foodLibraryItems: [] }), { foodLibraryItems: [] });
  assert.throws(() => parseFoodLogPatch({ foodLibraryItems: [input, input] }), /不同/);
  for (const quantity of [-1, NaN, Infinity, 1000001]) assert.throws(() => parseFoodLogPatch({ foodLibraryItems: [{ ...input, quantity }] }));
  assert.throws(() => parseFoodLogPatch({ foodLibraryItems: [{ ...input, unit: "kg" }] }));
  assert.throws(() => parseFoodLogPatch({ foodLibraryItems: [{ ...input, foodLibraryId: 1.5 }] }));
});
