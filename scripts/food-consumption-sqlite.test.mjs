import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("food portions persist through CRUD, migrations, library updates, summaries and manual overrides", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-food-consumption-"));
  const databasePath = path.join(directory, "food.db");
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  function run(program) {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  try {
    run('import "./src/lib/db.ts";');
    const old = new DatabaseSync(databasePath);
    old.exec(`ALTER TABLE food_logs DROP COLUMN food_library_items; ALTER TABLE food_logs DROP COLUMN food_kcal_mode; DELETE FROM migrations WHERE version=68;
      INSERT INTO food_logs(id,occurred_at,meal_type,title,estimated_kcal,kcal_min,kcal_max) VALUES(1,'2026-10-05T04:00:00.000Z','lunch','旧记录',300,250,350);`);
    old.close();
    run(`import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import * as food from "./src/lib/services/food.ts";
      import {getDailyNutritionSummary} from "./src/lib/services/nutrition.ts";
      import {parseNewFoodLog,parseFoodLogPatch,parseFoodLibraryItem,parseFoodPlace} from "./src/lib/validation.ts";
      const old=db.getFoodLog(1);assert.equal(old.estimatedKcal,300);assert.equal(old.kcalMin,250);assert.deepEqual(old.foodLibraryItems,[]);assert.equal(old.foodKcalMode,"manual");
      const place=db.createFoodPlace(parseFoodPlace({name:"超市",kind:"retail"}));
      const a=db.upsertFoodLibraryItem(parseFoodLibraryItem({name:"饼干",referenceType:"per_100g",referenceKcal:530}));
      const b=db.upsertFoodLibraryItem(parseFoodLibraryItem({name:"牛奶",referenceType:"per_100ml",referenceKcal:40}));
      const portions=[{foodLibraryId:a.id,quantity:18.6,unit:"g"},{foodLibraryId:b.id,quantity:250,unit:"ml"}];
      const saved=await food.createFoodLog(parseNewFoodLog({title:"早餐",occurredAt:"2026-10-05T04:00:00.000Z",occurredHasExplicitTime:false,foodPlaceId:place.id,foodLibraryItems:portions,foodKcalMode:"auto",estimatedKcal:999}));
      assert.equal(saved.estimatedKcal,199);assert.equal(saved.foodLibraryItems[0].calculatedKcal,98.58);assert.equal(saved.foodLibraryId,a.id);assert.equal(saved.occurredHasExplicitTime,false);
      assert.equal(db.getPlaceLibraryItems(place.id).length,2);assert.equal(db.getPlaceLibraryItems(place.id)[0].recordCount,1);
      db.updateFoodLibraryItem(a.id,{...a,referenceKcal:800});
      const titleEdit=await food.updateFoodLog(saved.id,parseFoodLogPatch({title:"改名字"}));assert.equal(titleEdit.estimatedKcal,199);assert.deepEqual(titleEdit.foodLibraryItems,saved.foodLibraryItems);
      const portionEdit=await food.updateFoodLog(saved.id,parseFoodLogPatch({foodLibraryItems:[{...portions[0],quantity:40},portions[1]]}));assert.equal(portionEdit.estimatedKcal,312);assert.equal(portionEdit.foodLibraryItems[0].nutritionReference.referenceKcal,530);
      const manual=await food.updateFoodLog(saved.id,parseFoodLogPatch({estimatedKcal:500,kcalMin:450,kcalMax:550}));assert.equal(manual.foodKcalMode,"manual");
      const changed=await food.updateFoodLog(saved.id,parseFoodLogPatch({foodLibraryItems:portions}));assert.equal(changed.estimatedKcal,500);assert.equal(changed.kcalMin,450);
      assert.equal((await getDailyNutritionSummary("2026-10-05")).estimatedIntakeKcal,800);
      assert.equal(db.removeFoodLibraryItem(b.id).action,"archived");
      await food.updateFoodLog(saved.id,parseFoodLogPatch({foodLibraryItems:portions}));
      const reordered=await food.updateFoodLog(saved.id,parseFoodLogPatch({foodLibraryId:b.id,foodLibraryItems:[portions[1],portions[0]]}));assert.equal(reordered.foodLibraryId,b.id);
      await assert.rejects(()=>food.createFoodLog(parseNewFoodLog({title:"新记录",foodLibraryItems:[portions[1]],foodKcalMode:"auto"})),/归档/);
      const incomplete=await food.updateFoodLog(saved.id,parseFoodLogPatch({foodLibraryItems:[{...portions[0],quantity:null}],foodKcalMode:"auto"}));assert.equal(incomplete.estimatedKcal,null);
      await food.updateFoodLog(saved.id,parseFoodLogPatch({foodLibraryItems:[],foodKcalMode:"manual",estimatedKcal:120}));assert.equal(db.getFoodLog(saved.id).foodLibraryId,null);assert.deepEqual(db.getPlaceLibraryItems(place.id),[]);
      const legacy=await food.createFoodLog(parseNewFoodLog({title:"旧客户端",foodLibraryId:a.id,estimatedKcal:70}));assert.equal(legacy.foodLibraryId,a.id);assert.equal(legacy.estimatedKcal,70);
      db.removeFoodLibraryItem(a.id);
      const legacyEdit=await food.updateFoodLog(legacy.id,parseFoodLogPatch({foodLibraryItems:[portions[0]],foodKcalMode:"manual",estimatedKcal:70}));assert.equal(legacyEdit.estimatedKcal,70);
      await food.deleteFoodLog(saved.id);
      const {mcpHandler}=await import("./src/lib/mcp/server.ts");
      const {withMcpRequestRepository}=await import("./src/lib/repositories/index.ts");
      const c=db.upsertFoodLibraryItem(parseFoodLibraryItem({name:"MCP 份量",referenceType:"per_serving",servingKcal:180}));
      const mcp=await withMcpRequestRepository({userId:"local",accessToken:"isolated"},async()=>{
        const response=await mcpHandler.fetch(new Request("http://localhost/api/mcp",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream","MCP-Protocol-Version":"2025-03-26"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"eo_create",arguments:{resource:"food_log",data:{title:"MCP 食品",food_kcal_mode:"auto",food_library_items:[{food_library_id:c.id,quantity:0.5,unit:"serving"}]}}}})}));
        const raw=await response.text();return JSON.parse(response.headers.get("content-type")?.includes("text/event-stream")?raw.split("\\n").find(line=>line.startsWith("data:"))?.slice(5):raw).result;
      });
      assert.notEqual(mcp.isError,true,JSON.stringify(mcp));assert.equal(mcp.structuredContent.item.estimated_kcal,90);assert.equal(mcp.structuredContent.item.food_library_items[0].calculated_kcal,90);
    `);
    run('import "./src/lib/db.ts";');
    const database = new DatabaseSync(databasePath);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM migrations WHERE version=68").get().n, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    database.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
