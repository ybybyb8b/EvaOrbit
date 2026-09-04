import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/202609050001_meal_reminders.sql", import.meta.url), "utf8");

test("meal reminder migration is owner-scoped and delivery-safe", () => {
  assert.match(migration, /primary key\(user_id,meal_type\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\)\)=user_id/i);
  assert.match(migration, /target_type in \('cat','cat_household','tracker','food'\)/i);
  assert.match(migration, /unique index[\s\S]*source_type='meal_missing'/i);
});
