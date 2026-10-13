import assert from "node:assert/strict";
import test from "node:test";
import { migrateFoodDrinkRecord } from "./food-drink-record-migration.ts";
import { BACKUP_TABLES, BACKUP_VERSION, parseBackupDocument, normalizeBackupRowForSqlite } from "./data-backup.ts";

test("legacy food text and drink metadata migrate once without guessing consumption", () => {
  const food = migrateFoodDrinkRecord("food_logs", { id: 1, description: "米饭", portion: "半碗", notes: "饭后散步", calendar_time_enabled: false, estimated_kcal: 0 });
  assert.deepEqual(food, { id: 1, description: "米饭\n\n份量说明：半碗\n\n饭后散步", estimated_kcal: 0 });
  const drink = migrateFoodDrinkRecord("drink_logs", { notes: "喝了一半", brand: "旧品牌", volume_ml: 350, caffeine_mg: 0, consumed_volume_ml: null });
  assert.deepEqual(drink, { notes: "喝了一半\n\n品牌：旧品牌\n\n原记录容量：350 ml\n\n原记录咖啡因：0 mg", consumed_volume_ml: null });
  assert.deepEqual(migrateFoodDrinkRecord("food_logs", food), food);
  assert.deepEqual(migrateFoodDrinkRecord("drink_logs", drink), drink);
  assert.equal(migrateFoodDrinkRecord("food_logs", { description: "饭", notes: "饭", portion: "饭" }).description, "饭");
});

test("older backups normalize retired fields before database restore", () => {
  const resources: Record<string, Record<string, unknown>[]> = Object.fromEntries(BACKUP_TABLES.map(table => [table, []]));
  resources.food_logs = [{ id: 1, description: "饭", notes: "备注", portion: "一份" }];
  resources.drink_logs = [{ id: 2, name: "茶", brand: "旧品牌", volume_ml: 500, caffeine_mg: 0 }];
  const parsed = parseBackupDocument({ backup_version: BACKUP_VERSION, exported_at: "2026-10-13T00:00:00Z", schema: { supabase_migration: "legacy" }, resources });
  assert.equal(parsed.resources.food_logs[0].description, "饭\n\n份量说明：一份\n\n备注");
  assert.equal("brand" in parsed.resources.drink_logs[0], false);
  assert.equal("consumed_volume_ml" in parsed.resources.drink_logs[0], false);
  assert.deepEqual(normalizeBackupRowForSqlite("drink_logs", parsed.resources.drink_logs[0]), parsed.resources.drink_logs[0]);
});
