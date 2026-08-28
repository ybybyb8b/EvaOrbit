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
];

test("MCP tools/list exposes only the documented tools", () => {
  const source = readFileSync(new URL("./mcp/server.ts", import.meta.url), "utf8");
  const registered = [...source.matchAll(/server\.registerTool\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered, expectedTools);
});

test("daily_energy_upsert reuses the existing validated nutrition service", () => {
  const source = readFileSync(new URL("./mcp/server.ts", import.meta.url), "utf8");
  assert.match(source, /server\.registerTool\("daily_energy_upsert"/);
  assert.match(source, /parseDailyEnergy\(/);
  assert.match(source, /updateDailyEnergy\(parsed\.date, parsed\)/);
});
