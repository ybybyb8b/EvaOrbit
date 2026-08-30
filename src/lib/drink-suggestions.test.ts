import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDrinkInputSuggestions } from "./drink-suggestions.ts";
import { monthRange } from "./time.ts";
import type { DrinkLog } from "./types.ts";

function drink(id: number, occurredAt: string, name: string, brand: string, notes = ""): DrinkLog {
  return { id, occurredAt, name, brand, drinkType: "coffee", volumeMl: null, sugarLevel: "", caffeineMg: null, estimatedKcal: null, kcalMin: null, kcalMax: null, confidence: "medium", foodLibraryId: null, notes, createdAt: occurredAt, updatedAt: occurredAt };
}

test("ranks trimmed Drink name and brand history by frequency then recency", () => {
  const suggestions = buildDrinkInputSuggestions([
    drink(1, "2026-08-01T08:00:00Z", " Latte ", "Brand A", "notes are not suggestions"),
    drink(2, "2026-08-20T08:00:00Z", "latte", " Brand A "),
    drink(3, "2026-08-30T08:00:00Z", "Tea", "Brand B"),
    drink(4, "2026-08-29T08:00:00Z", "Soda", "Brand C"),
  ]);
  assert.deepEqual(suggestions.names, ["latte", "Tea", "Soda"]);
  assert.deepEqual(suggestions.brands, ["Brand A", "Brand B", "Brand C"]);
  assert.equal(suggestions.names.includes("notes are not suggestions"), false);
});

test("builds a natural calendar-month range in EvaOrbit time", () => {
  assert.deepEqual(monthRange(new Date("2026-02-15T12:00:00Z")), { from: "2026-01-31T16:00:00.000Z", to: "2026-02-28T16:00:00.000Z" });
});

test("monthly Limit migrations preserve existing rows while widening the constraint", () => {
  const sqlite = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("./services/drink.ts", import.meta.url), "utf8");
  const postgres = readFileSync(new URL("../../supabase/migrations/202608310001_drink_monthly_limits.sql", import.meta.url), "utf8");
  assert.match(sqlite, /INSERT INTO drink_limits\(id,name,target_type,period,limit_value,enabled,created_at,updated_at\)[\s\S]*SELECT id,name,target_type,period,limit_value,enabled,created_at,updated_at/);
  assert.match(sqlite, /period IN \('daily','weekly','monthly'\)/);
  assert.match(service, /limit\.period === "weekly" \? weekRange\(at\) : monthRange\(at\)/);
  assert.match(postgres, /period in \('daily','weekly','monthly'\)/);
});
