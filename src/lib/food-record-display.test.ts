import assert from "node:assert/strict";
import test from "node:test";
import { foodRecordDisplay } from "./food-record-display.ts";
import { parseFoodLogPatch, parseNewFoodLog } from "./validation.ts";

test("history removes exact duplicated dishes while retaining different linked names", () => {
  assert.deepEqual(foodRecordDisplay({ title: "招牌烤牛肉拌饭", foodDishes: [{ id: 1, name: "招牌烤牛肉拌饭" }] }), { title: "招牌烤牛肉拌饭", dishes: [] });
  assert.deepEqual(foodRecordDisplay({ title: "沙县小吃（滨江和城店） | 鸡腿饭", foodPlaceName: "沙县小吃", foodPlaceBranch: "滨江和城店", foodDishes: [{ id: 2, name: "鸡腿套餐" }] }), { title: "鸡腿饭", dishes: [{ id: 2, name: "鸡腿套餐" }] });
  assert.equal(foodRecordDisplay({ title: "别家店 | 鸡腿饭", foodPlaceName: "沙县小吃" }).title, "别家店 | 鸡腿饭");
  assert.equal(foodRecordDisplay({ title: "牛肉饭 + 汤", foodDishes: [{ id: 1, name: "牛肉饭" }, { id: 2, name: "汤" }, { id: 3, name: "烤牛肉饭" }] }).dishes[0].id, 3);
});

test("food associations accept ordered multiple dishes and preserve legacy partial updates", () => {
  const input = parseNewFoodLog({ title: "午餐", foodPlaceId: 1, foodDishIds: [3, 2, 3] });
  assert.deepEqual(input.foodDishIds, [3, 2]);
  assert.equal(input.foodDishId, 3);
  assert.deepEqual(parseNewFoodLog({ title: "午餐", foodDishId: 2 }).foodDishIds, [2]);
  assert.deepEqual(parseFoodLogPatch({ title: "改标题" }), { title: "改标题" });
  assert.deepEqual(parseFoodLogPatch({ foodDishIds: [] }), { foodDishIds: [] });
  for (const ids of [[1.5], [0], [-1], ["1"], null, Array(51).fill(1)]) assert.throws(() => parseFoodLogPatch({ foodDishIds: ids }));
});
