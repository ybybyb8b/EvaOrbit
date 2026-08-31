import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedTools = [
  "food_search_recent",
  "food_create",
  "food_update",
  "food_delete",
  "food_library_search",
  "food_library_create",
  "food_library_update",
  "food_library_delete",
  "drink_search_recent",
  "drink_create",
  "drink_update",
  "drink_delete",
  "nutrition_get_daily_summary",
  "daily_energy_upsert",
  "tracker_list",
  "tracker_create_entry",
  "eo_resources",
  "eo_schema",
  "eo_search",
  "eo_get",
  "eo_create",
  "eo_update",
  "eo_delete",
  "eo_action",
];

test("MCP tools/list preserves the 16 dedicated tools and adds the 8 generic tools", () => {
  const source = readFileSync(new URL("./mcp/server.ts", import.meta.url), "utf8");
  const genericSource = readFileSync(new URL("./mcp/resource-tools.ts", import.meta.url), "utf8");
  const registered = [...`${source}\n${genericSource}`.matchAll(/server\.registerTool\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered, expectedTools);
  assert.deepEqual(registered.slice(0, 16), expectedTools.slice(0, 16));
  assert.equal(new Set(registered).size, 24);
});

test("generic resource remains a plain string in every fixed tool schema", () => {
  const source = readFileSync(new URL("./mcp/resource-tools.ts", import.meta.url), "utf8");
  assert.match(source, /const resource = z\.string\(\)/);
  assert.doesNotMatch(source, /const resource = z\.enum/);
  assert.match(source, /server\.registerTool\("eo_resources"/);
  assert.match(source, /server\.registerTool\("eo_action"/);
});

test("daily_energy_upsert reuses the existing validated nutrition service", () => {
  const source = readFileSync(new URL("./mcp/server.ts", import.meta.url), "utf8");
  assert.match(source, /server\.registerTool\("daily_energy_upsert"/);
  assert.match(source, /parseDailyEnergy\(/);
  assert.match(source, /updateDailyEnergy\(parsed\.date, parsed\)/);
});

test("Food and Drink MCP CRUD expose scene, rating, temperature and Drink time precision",()=>{
  const source=readFileSync(new URL("./mcp/server.ts",import.meta.url),"utf8");
  assert.match(source,/scene: record\.scene, rating: record\.rating/);
  assert.match(source,/occurred_has_explicit_time: record\.occurredHasExplicitTime/);
  assert.match(source,/temperature: record\.temperature, rating: record\.rating/);
  assert.match(source,/occurred_has_explicit_time: z\.boolean\(\)\.optional\(\)/);
  assert.match(source,/rating: tasteRating\.nullable\(\)\.optional\(\)/);
});
