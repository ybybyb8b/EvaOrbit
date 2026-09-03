import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("food places migration keeps Food Records optional and history-safe",()=>{
  const sqlite=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
  const supabase=readFileSync(new URL("../../supabase/migrations/202609030002_food_places.sql",import.meta.url),"utf8");
  for(const source of[sqlite,supabase]){
    assert.match(source,/food_places/);assert.match(source,/food_dishes/);
    assert.match(source,/food_place_id/);assert.match(source,/food_dish_id/);
    assert.match(source,/on delete set null/i);
    assert.doesNotMatch(source,/food_logs[\s\S]{0,120}on delete cascade/i);
  }
  assert.match(sqlite,/version = 33/);assert.match(sqlite,/INSERT INTO migrations\(version\) VALUES\(33\)/);
  assert.match(supabase,/enable row level security/);assert.match(supabase,/food_places_owner_select/);assert.match(supabase,/food_dishes_owner_delete/);
});

test("store library stays inside Food without a new primary destination",()=>{
  const food=readFileSync(new URL("../app/food/food-view.tsx",import.meta.url),"utf8");
  const shell=readFileSync(new URL("../components/app-shell.tsx",import.meta.url),"utf8");
  assert.match(food,/href="\/food\/places"/);
  assert.doesNotMatch(shell,/\/food\/places/);
});
