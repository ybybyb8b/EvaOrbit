import assert from "node:assert/strict";
import test from "node:test";
import { buildCatFoodSummary, catFoodCadenceSuggestion, normalizedCatFoodPrice } from "./cat-food.ts";
import type { CatFoodItem, CatFoodPurchase } from "./types.ts";

const item: CatFoodItem = { id:1,name:"Indoor",brand:"Royal",category:"dry",flavor:"",notes:"",lowStockThresholdPackages:1,restockIntervalDays:null,restockLeadDays:7,restockReminderTime:null,restockReminderId:null,archivedAt:null,createdAt:"",updatedAt:"" };
function purchase(id:number,date:string,price:number,remaining=1):CatFoodPurchase{return{id,itemId:1,purchasedOn:date,merchant:"Store",packageCount:1,remainingPackageCount:remaining,amountPerPackage:2000,amountUnit:"g",paidAmountMinor:price,currency:"CNY",notes:"",createdAt:"",updatedAt:""};}

test("normalizes package prices to kilograms",()=>{assert.deepEqual(normalizedCatFoodPrice(purchase(1,"2026-01-01",12000)),{normalizedPriceMinor:6000,normalizedUnit:"kg"});});
test("suggests only a stable cadence",()=>{assert.equal(catFoodCadenceSuggestion([purchase(1,"2026-01-01",1),purchase(2,"2026-03-01",1),purchase(3,"2026-05-01",1),purchase(4,"2026-06-30",1)])?.intervalDays,60);assert.equal(catFoodCadenceSuggestion([purchase(1,"2026-01-01",1),purchase(2,"2026-01-05",1),purchase(3,"2026-05-01",1),purchase(4,"2026-06-30",1)]),null);});
test("builds stock and historical comparison",()=>{const summary=buildCatFoodSummary(item,[purchase(1,"2026-01-01",12000,0),purchase(2,"2026-03-01",10000,1)]);assert.equal(summary.stockPackages,1);assert.equal(summary.stockState,"low");assert.equal(summary.latestPurchase?.changePercent,-16.7);assert.equal(summary.latestPurchase?.isBestPrice,true);});
