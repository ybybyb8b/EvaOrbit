import assert from "node:assert/strict";
import test from "node:test";
import { moveTrackerOrder, orderedTrackerGroups, readTrackerOrder } from "./tracker-order.ts";

test("tracker order validates storage and retains new, renamed and archived items without changing groups", () => {
  assert.deepEqual(readTrackerOrder("broken"), { groups: [], entries: [] });
  assert.deepEqual(readTrackerOrder('{"groups":["A","A",5],"entries":[2,2,0,-1,"3",null]}'), { groups: ["A"], entries: [2] });
  const items = [{ id: 1, groupName: "A" }, { id: 2, groupName: "A" }, { id: 3, groupName: "B" }, { id: 4, groupName: "A" }];
  const order = { groups: ["B", "deleted", "A"], entries: [3, 2, 1, 99] };
  assert.deepEqual(orderedTrackerGroups(items, order).map(group => [group.name, group.items.map(item => item.id)]), [["B", [3]], ["A", [2, 1, 4]]]);
  assert.deepEqual(orderedTrackerGroups(items.filter(item => item.id !== 2), order)[1].items.map(item => item.id), [1, 4]);
  assert.deepEqual(orderedTrackerGroups([...items, { id: 5, groupName: "New" }], order).at(-1)?.name, "New");
  assert.deepEqual(items.map(item => item.id), [1, 2, 3, 4]);
});

test("moving groups and entries supports both directions, invalid targets and stable unrelated entries", () => {
  assert.deepEqual(moveTrackerOrder(["A", "B", "C"], "A", "C"), ["B", "C", "A"]);
  assert.deepEqual(moveTrackerOrder([1, 2, 3], 3, 1), [3, 1, 2]);
  assert.deepEqual(moveTrackerOrder([1, 2, 3], 1, 99), [1, 2, 3]);
});
