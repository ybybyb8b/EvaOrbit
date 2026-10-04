import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("common home reflects independent record and limit mutations without losing date-only semantics", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-food-drink-home-"));
  try {
    const program = String.raw`
      import assert from "node:assert/strict";
      import { getFoodDrinkHome } from "./src/lib/services/food-drink-home.ts";
      import * as food from "./src/lib/services/food.ts";
      import * as drink from "./src/lib/services/drink.ts";
      import { parseNewFoodLog, parseNewDrinkLog, parseDrinkLimit } from "./src/lib/validation.ts";
      import { dateInEvaOrbit } from "./src/lib/time.ts";
      const date = dateInEvaOrbit(), occurredAt = date + "T12:00:00+08:00";
      const meal = await food.createFoodLog(parseNewFoodLog({ title: "午餐", occurredAt, occurredHasExplicitTime: false }));
      const { drink: cup } = await drink.createDrinkLog(parseNewDrinkLog({ name: "茶", drinkType: "tea", occurredAt: date + "T14:00:00+08:00", occurredHasExplicitTime: true }));
      const limit = await drink.createDrinkLimit(parseDrinkLimit({ name: "茶数量", targetType: "tea", period: "daily", limitValue: 1, enabled: true }));
      const paused = await drink.createDrinkLimit(parseDrinkLimit({ name: "暂停", targetType: "coffee", period: "weekly", limitValue: 5, enabled: false }));
      let home = await getFoodDrinkHome();
      assert.equal(home.brief.foodCount, 1); assert.equal(home.brief.drinkCount, 1);
      assert.equal(home.brief.latest.kind, "drink"); assert.equal(home.brief.latest.record.id, cup.id);
      assert.equal(home.limitStatuses[0].state, "reached_limit"); assert.equal(home.limitStatuses[0].count, 1);
      assert.equal(home.limits.length, 2); assert.equal(home.limitStatuses.length, 1); assert.deepEqual(home.insights, []);
      await drink.updateDrinkLimit(limit.id, { limitValue: 5 });
      home = await getFoodDrinkHome(); assert.equal(home.limitStatuses[0].state, "within_limit");
      await drink.updateDrinkLimit(limit.id, { enabled: false });
      home = await getFoodDrinkHome(); assert.equal(home.limitStatuses.length, 0);
      await drink.deleteDrinkLog(cup.id);
      home = await getFoodDrinkHome(); assert.equal(home.brief.drinkCount, 0); assert.equal(home.brief.latest.kind, "food"); assert.equal(home.brief.latest.record.occurredHasExplicitTime, false);
      await food.updateFoodLog(meal.id, { title: "更新后的午餐" });
      home = await getFoodDrinkHome(); assert.equal(home.brief.latest.record.title, "更新后的午餐");
      await food.deleteFoodLog(meal.id); await drink.deleteDrinkLimit(limit.id); await drink.deleteDrinkLimit(paused.id);
      home = await getFoodDrinkHome(); assert.equal(home.brief.latest, null); assert.equal(home.brief.foodCount, 0); assert.deepEqual(home.limits, []);
    `;
    const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "home.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
