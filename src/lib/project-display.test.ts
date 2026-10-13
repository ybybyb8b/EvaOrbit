import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProjectModule, filterProjectItems, groupProjectItems, joinProjectModule, projectItemTypeLabels, projectModuleCatalog, splitProjectModule } from "./project-display.ts";
import type { ProjectItem } from "./types.ts";

const items: ProjectItem[] = [
  { id: 79, module: "Subscriptions / Core", type: "feature", status: "doing" },
  { id: 104, module: "Subscriptions / UI", type: "bug", status: "done" },
  { id: 105, module: "Subscriptions / UI", type: "ui", status: "verified" },
  { id: 110, module: "Subscriptions", type: "bug", status: "to_solve" },
  { id: 111, module: null, type: "bug", status: "blocked" },
  { id: 112, module: "Weather", type: "research", status: "dropped" },
] as ProjectItem[];

test("module catalog reuses normalized names and retains legacy values without writing records", () => {
  const before = structuredClone(items);
  const values = items.map(item => item.module);
  const catalog = projectModuleCatalog([...values, " subscriptions / ui ", "Food & Drink / Places"]);
  assert.deepEqual(catalog.find(entry => entry.name === "Subscriptions"), { name: "Subscriptions", categories: ["Core", "UI"] });
  assert.equal(canonicalProjectModule("subscriptions/ui", values), "Subscriptions / UI");
  assert.equal(canonicalProjectModule("Kitchen / Inventory", values), "Kitchen / Inventory");
  assert.deepEqual(splitProjectModule("Food & Drink / Places"), { module: "Food & Drink", category: "Places" });
  assert.equal(joinProjectModule("Weather"), "Weather");
  assert.deepEqual(splitProjectModule("Legacy / Group / Detail"), { module: "Legacy", category: "Group / Detail" });
  assert.deepEqual(items, before);
});

test("module groups keep mixed statuses and derive counts from combined filters", () => {
  const group = groupProjectItems(items).find(group => group.name === "Subscriptions")!;
  assert.equal(group.items.length, 4);
  assert.deepEqual(group.categories.find(category => category.name === "UI")?.items.map(item => item.id), [104, 105]);
  assert.deepEqual(new Set(group.items.map(item => item.status)), new Set(["doing", "done", "verified", "to_solve"]));
  const unfinishedBugs = filterProjectItems(items, "unfinished", "bug");
  assert.deepEqual(unfinishedBugs.map(item => item.id), [110, 111]);
  assert.deepEqual(groupProjectItems(unfinishedBugs).map(group => [group.name, group.items.length]), [["Subscriptions", 1], ["", 1]]);
  assert.deepEqual(filterProjectItems(items, "done", "bug").map(item => item.id), [104]);
  assert.equal(filterProjectItems(items, "verified", "bug").length, 0);
  assert.deepEqual(filterProjectItems(items, "unfinished", "bug", "Subscriptions").map(item => item.id), [110]);
  assert.equal(projectItemTypeLabels.bug, "Bug Fix");
});
