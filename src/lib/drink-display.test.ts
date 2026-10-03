import assert from "node:assert/strict";
import test from "node:test";
import { drinkRecordName } from "./drink-display.ts";
import { parseNewDrinkLog, parseDrinkLogPatch } from "./validation.ts";
import { buildDrinkPreferenceSummary } from "./drink-preferences.ts";
import { buildDrinkInputSuggestions } from "./drink-suggestions.ts";
import { buildTimelineEvents } from "./timeline.ts";
import type { DrinkLog } from "./types.ts";

const record:DrinkLog={...parseNewDrinkLog({drinkType:"tea",occurredAt:"2026-10-04T12:00:00+08:00",occurredHasExplicitTime:false}),id:1,createdAt:"2026-10-04",updatedAt:"2026-10-04"};
test("optional drink names use menu, manual name, then type without fabricating stored names",()=>{
 assert.equal(record.name,"");assert.equal(drinkRecordName(record),"茶");
 assert.equal(drinkRecordName({...record,name:" 自制花茶 "}),"自制花茶");
 assert.equal(drinkRecordName({...record,name:"旧手填名",drinkMenuName:"茉莉奶茶"}),"茉莉奶茶");
 assert.deepEqual(parseDrinkLogPatch({name:""}),{name:""});assert.deepEqual(parseDrinkLogPatch({notes:"只改备注"}),{notes:"只改备注"});
 const event=buildTimelineEvents([],[record])[0];assert.equal(event.title,"茶");assert.equal(event.hasExplicitTime,false);
 const summary=buildDrinkPreferenceSummary([record,{...record,id:2,drinkMenuName:"茉莉奶茶"}]);
 assert.equal(summary.totalRecords,2);assert.equal(summary.commonDrinks.length,1);assert.equal(summary.commonDrinks[0].name,"茉莉奶茶");
 assert.equal(record.name,"");
});
test("brand search retains the full ranked history beyond thirty brands",()=>{
 const records=Array.from({length:55},(_,index)=>({...record,id:index+1,brand:`品牌${index}`}));
 const suggestions=buildDrinkInputSuggestions(records);
 assert.equal(suggestions.brands.length,55);assert.equal(suggestions.names.length,0);
});
