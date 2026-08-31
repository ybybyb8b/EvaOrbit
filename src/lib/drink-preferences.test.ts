import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDrinkPreferenceSummary } from "./drink-preferences.ts";
import type { DrinkLog } from "./types.ts";

function drink(id:number,occurredAt:string,name:string,rating:DrinkLog["rating"],extra:Partial<DrinkLog>={}):DrinkLog{return{id,occurredAt,occurredHasExplicitTime:false,name,brand:"",drinkType:"tea",volumeMl:null,sugarLevel:"",temperature:null,rating,caffeineMg:null,estimatedKcal:null,kcalMin:null,kcalMax:null,confidence:"medium",foodLibraryId:null,notes:"",createdAt:occurredAt,updatedAt:occurredAt,...extra};}

test("Drink preferences combine rating, repurchase frequency and recency without calling a frequent neutral drink a favorite",()=>{
  const logs=[
    drink(1,"2026-08-29T04:00:00.000Z","喜欢的茶","love",{brand:"A",sugarLevel:"微糖",temperature:"less_ice"}),
    drink(2,"2026-08-27T04:00:00.000Z","喜欢的茶","good",{brand:"A",sugarLevel:"微糖",temperature:"less_ice"}),
    ...Array.from({length:6},(_,index)=>drink(10+index,`2026-08-${String(20+index).padStart(2,"0")}T04:00:00.000Z`,"经常但一般","neutral")),
  ];
  const summary=buildDrinkPreferenceSummary(logs,new Date("2026-08-31T04:00:00.000Z"));
  assert.equal(summary.commonDrinks[0].name,"经常但一般");
  assert.equal(summary.preferredDrinks[0].name,"喜欢的茶");
  assert.deepEqual(summary.sugarTendency[0],{value:"微糖",count:2});
  assert.deepEqual(summary.temperatureTendency[0],{value:"less_ice",count:2});
});

test("Food and Drink taste migration preserves old rows and adds constrained nullable signals",()=>{
  const sqlite=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
  const postgres=readFileSync(new URL("../../supabase/migrations/202608310003_food_drink_taste_fields.sql",import.meta.url),"utf8");
  assert.match(sqlite,/ALTER TABLE food_logs ADD COLUMN rating/);
  assert.match(sqlite,/ALTER TABLE drink_logs ADD COLUMN occurred_has_explicit_time INTEGER NOT NULL DEFAULT 1/);
  assert.match(sqlite,/temperature TEXT CHECK/);
  assert.match(postgres,/alter table public\.food_logs[\s\S]*rating text/);
  assert.match(postgres,/occurred_has_explicit_time boolean not null default true/);
  assert.match(postgres,/normal_ice.*less_ice.*no_ice.*room_temperature.*hot/);
});
