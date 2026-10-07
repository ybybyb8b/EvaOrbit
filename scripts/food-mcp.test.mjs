import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("MCP Food tools support location fields, search and multiple-dish CRUD end to end", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-food-mcp-"));
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  const program = String.raw`
    import assert from "node:assert/strict";
    import {mcpHandler} from "./src/lib/mcp/server.ts";
    import {withMcpRequestRepository} from "./src/lib/repositories/index.ts";
    let requestId=0;
    async function rpc(method,params={}) {
      return withMcpRequestRepository({userId:"local",accessToken:"isolated-test"},async()=>{
        const response=await mcpHandler.fetch(new Request("http://localhost/api/mcp",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream","MCP-Protocol-Version":"2025-03-26"},body:JSON.stringify({jsonrpc:"2.0",id:++requestId,method,params})}));
        assert.equal(response.status,200,await response.clone().text());
        const raw=await response.text();
        const payload=JSON.parse(response.headers.get("content-type")?.includes("text/event-stream")?raw.split("\n").find(line=>line.startsWith("data:"))?.slice(5):raw);
        assert.equal(payload.error,undefined,JSON.stringify(payload));return payload.result;
      });
    }
    async function call(name,args={}){const result=await rpc("tools/call",{name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;}
    try {
      const {tools}=await rpc("tools/list");
      for(const resource of ["food_log","drink_log"]){
        for(const name of ["eo_create","eo_update"]){
          assert.equal(tools.find(t=>t.name===name).inputSchema.additionalProperties,false);
          const data=resource==="food_log"?{title:"字段错误的测试",foodPlaceId:1,foodDishIds:[1]}:{name:"字段错误的测试",foodPlaceId:1,drinkMenuId:1};
          const invalid=await rpc("tools/call",{name,arguments:{resource,data,...name==="eo_update"?{id:999999}:{}}});
          assert.equal(invalid.isError,true,"Unknown association fields must not silently create or update an unlinked record");
        }
      }
      assert.equal((await call("eo_schema",{resource:"drink_log"})).schema.required_fields.includes("name"),false);
      const {item:unnamed}=await call("eo_create",{resource:"drink_log",data:{drink_type:"water",occurred_has_explicit_time:false}});assert.equal(unnamed.name,"");
      const {item:manual}=await call("eo_update",{resource:"drink_log",id:unnamed.id,data:{name:"自制饮品"}});assert.equal(manual.name,"自制饮品");
      assert.equal((await call("eo_update",{resource:"drink_log",id:unnamed.id,data:{name:""}})).item.name,"");await call("eo_delete",{resource:"drink_log",id:unnamed.id});
      assert.equal((await call("eo_schema",{resource:"food_log"})).schema.fields.food_dish_ids.type,"array");
      const {schema}=await call("eo_schema",{resource:"food_place"});
      assert.ok((await call("eo_resources")).resources.find(r=>r.resource==="food_place").capabilities.includes("delete"));
      for(const field of ["city","location","category"])assert.ok(schema.writable_fields.includes(field));
      const {item:place}=await call("eo_create",{resource:"food_place",data:{name:"测试饭店",service_type:"both",city:"成都",location:"高新区",category:"川菜"}});
      assert.equal(place.city,"成都");assert.equal(place.location,"高新区");
      const {item:updated}=await call("eo_update",{resource:"food_place",id:place.id,data:{location:"天府和悦",category:"快餐"}});assert.equal(updated.location,"天府和悦");
      const {items:places}=await call("eo_search",{resource:"food_place",query:"天府和悦",filters:{category:"快餐"}});assert.equal(places[0].id,place.id);
      assert.ok((await call("eo_schema",{resource:"drink_log"})).schema.update_fields.includes("food_place_id"));
      const {item:drink}=await call("eo_create",{resource:"drink_log",data:{name:"奶茶",brand:"测试品牌",drink_type:"milk_tea",food_place_id:place.id,occurred_at:"2026-10-03T12:00:00+08:00",occurred_has_explicit_time:false}});
      assert.equal(drink.food_place_city,"成都");assert.equal(drink.food_place_location,"天府和悦");assert.equal(drink.brand,"测试品牌");
      assert.equal((await call("eo_search",{resource:"drink_log",filters:{food_place_id:place.id}})).items[0].id,drink.id);
      assert.equal((await call("eo_search",{resource:"drink_log",query:"天府和悦",filters:{}})).items[0].id,drink.id);
      const {item:drinkRenamed}=await call("eo_update",{resource:"drink_log",id:drink.id,data:{name:"换名字"}});assert.equal(drinkRenamed.food_place_id,place.id);assert.equal(drinkRenamed.occurred_has_explicit_time,false);
      const invalidDrink=await rpc("tools/call",{name:"eo_update",arguments:{resource:"drink_log",id:drink.id,data:{food_place_id:999999}}});assert.equal(invalidDrink.isError,true);
      const {item:drinkUnlinked}=await call("eo_update",{resource:"drink_log",id:drink.id,data:{food_place_id:null}});assert.equal(drinkUnlinked.food_place_id,null);
      await call("eo_update",{resource:"drink_log",id:drink.id,data:{food_place_id:place.id}});
      const {item:drinkPlaceStats}=await call("eo_get",{resource:"food_place",id:place.id});assert.equal(drinkPlaceStats.drink_visit_count,1);assert.equal(drinkPlaceStats.visit_count,1);
      const ids=[];
      for(const name of ["鸡腿饭","紫菜汤"]){const {item}=await call("eo_create",{resource:"food_dish",data:{food_place_id:place.id,name,category:"午餐"}});ids.push(item.id);}
      const {items:dishes}=await call("eo_search",{resource:"food_dish",query:"汤",filters:{food_place_id:place.id}});assert.equal(dishes[0].id,ids[1]);
      const {item:unlinkedDinner}=await call("eo_create",{resource:"food_log",data:{title:"晚餐",meal_type:"dinner"}});
      const {item:linkedDinner}=await call("eo_update",{resource:"food_log",id:unlinkedDinner.id,data:{food_place_id:place.id,food_dish_ids:ids}});
      assert.equal(linkedDinner.food_place_id,place.id);assert.deepEqual(linkedDinner.food_dish_ids,ids);
      assert.deepEqual(linkedDinner,(await call("eo_search",{resource:"food_log",filters:{food_place_id:place.id}})).items.find(r=>r.id===linkedDinner.id));
      await call("eo_delete",{resource:"food_log",id:linkedDinner.id});
      const {item:record}=await call("eo_create",{resource:"food_log",data:{title:"午餐",food_place_id:place.id,food_dish_ids:ids,occurred_at:"2026-10-01T12:00:00+08:00",estimated_kcal:450}});
      assert.equal(record.food_place_id,place.id);
      assert.deepEqual((await call("eo_search",{resource:"food_log",filters:{food_place_id:place.id,food_dish_id:ids[1]}})).items.find(item=>item.id===record.id),record);
      assert.deepEqual(record.food_dish_ids,ids);assert.deepEqual(record.food_dishes.map(d=>d.name),["鸡腿饭","紫菜汤"]);
      assert.equal(record.food_place_city,"成都");assert.equal(record.food_place_location,"天府和悦");
      const {item:retimed}=await call("eo_update",{resource:"food_log",id:record.id,data:{occurred_at:"2026-10-02T18:35:00+08:00",occurred_has_explicit_time:true}});
      assert.equal(new Date(retimed.occurred_at).toISOString(),"2026-10-02T10:35:00.000Z");assert.equal(retimed.occurred_has_explicit_time,true);
      assert.equal((await call("eo_search",{resource:"food_log",filters:{date:"2026-10-01"}})).items.length,0);
      assert.equal((await call("eo_search",{resource:"food_log",filters:{date:"2026-10-02"}})).items[0].id,record.id);
      assert.equal((await call("eo_get",{resource:"nutrition_daily",id:"2026-10-01"})).item.estimated_intake_kcal,0);
      assert.equal((await call("eo_get",{resource:"nutrition_daily",id:"2026-10-02"})).item.estimated_intake_kcal,450);
      const {item:dateOnly}=await call("eo_update",{resource:"food_log",id:record.id,data:{occurred_at:"2026-10-02T12:00:00+08:00",occurred_has_explicit_time:false}});
      assert.equal(dateOnly.occurred_has_explicit_time,false);
      const {item:preservedTime}=await call("eo_update",{resource:"food_log",id:record.id,data:{title:"只改标题"}});assert.equal(preservedTime.occurred_has_explicit_time,false);assert.equal(preservedTime.occurred_at,dateOnly.occurred_at);
      const {getFoodLog}=await import("./src/lib/db.ts");const {buildTimelineEvents}=await import("./src/lib/timeline.ts");
      assert.equal(buildTimelineEvents([getFoodLog(record.id)],[])[0].hasExplicitTime,false);
      const {items:records}=await call("eo_search",{resource:"food_log",filters:{food_place_id:place.id,food_dish_id:ids[1]}});assert.equal(records[0].id,record.id);
      const {item:renamed}=await call("eo_update",{resource:"food_log",id:record.id,data:{title:"修改午餐"}});assert.deepEqual(renamed.food_dish_ids,ids);
      const {item:reordered}=await call("eo_update",{resource:"food_log",id:record.id,data:{food_dish_ids:[ids[1],ids[0]]}});assert.deepEqual(reordered.food_dish_ids,[ids[1],ids[0]]);
      const {item:other}=await call("eo_create",{resource:"food_place",data:{name:"别家店"}});
      assert.equal(other.service_type,"food");
      const {item:tea}=await call("eo_create",{resource:"food_place",data:{name:"只卖茶",service_type:"drink"}});
      const {item:menu}=await call("eo_create",{resource:"food_dish",data:{food_place_id:tea.id,kind:"drink",name:"茉莉奶茶"}});
      assert.equal(menu.kind,"drink");
      const reject=async(name,args)=>assert.equal((await rpc("tools/call",{name,arguments:args})).isError,true);
      await reject("eo_create",{resource:"food_log",data:{title:"吃饭",food_place_id:tea.id}});
      await reject("eo_create",{resource:"drink_log",data:{name:"茶",food_place_id:other.id}});
      await reject("eo_create",{resource:"food_dish",data:{food_place_id:tea.id,name:"米饭"}});
      await reject("eo_create",{resource:"food_dish",data:{food_place_id:other.id,kind:"drink",name:"茶"}});
      await reject("eo_create",{resource:"drink_log",data:{name:"茶",food_place_id:place.id,drink_menu_id:menu.id}});
      await reject("eo_create",{resource:"drink_log",data:{name:"茶",food_place_id:place.id,drink_menu_id:ids[0]}});
      const {items:before}=await call("eo_search",{resource:"drink_log",filters:{}});
      const {item:unlinkedTea}=await call("eo_create",{resource:"drink_log",data:{sugar_level:"无糖",temperature:"hot"}});
      const {item:linkedTea}=await call("eo_update",{resource:"drink_log",id:unlinkedTea.id,data:{food_place_id:tea.id,drink_menu_id:menu.id}});
      assert.equal(linkedTea.food_place_id,tea.id);assert.equal(linkedTea.drink_menu_id,menu.id);assert.equal(linkedTea.name,"茉莉奶茶");
      const {limits:linkedLimits,...linkedTeaRecord}=linkedTea;assert.ok(Array.isArray(linkedLimits));assert.deepEqual(linkedTeaRecord,(await call("eo_search",{resource:"drink_log",filters:{drink_menu_id:menu.id}})).items.find(r=>r.id===linkedTea.id));
      await call("eo_delete",{resource:"drink_log",id:linkedTea.id});
      const drinks=[];
      for(const [sugar_level,temperature] of [["无糖","hot"],["标准","normal_ice"]]){
        const {item:d}=await call("eo_create",{resource:"drink_log",data:{name:"占位名",food_place_id:tea.id,drink_menu_id:menu.id,sugar_level,temperature}});
        assert.equal(d.name,"茉莉奶茶");assert.equal(d.drink_menu_name,"茉莉奶茶");assert.equal(d.sugar_level,sugar_level);assert.equal(d.temperature,temperature);drinks.push(d);
      }
      assert.equal((await call("eo_search",{resource:"drink_log",filters:{drink_menu_id:menu.id}})).items.length,2);
      assert.equal((await call("eo_get",{resource:"food_dish",id:menu.id})).item.eat_count,2);
      assert.equal((await call("eo_get",{resource:"food_place",id:tea.id})).item.drink_menu_count,1);
      assert.equal((await call("eo_search",{resource:"food_dish",filters:{food_place_id:tea.id,kind:"food"}})).items.length,0);
      const drinkPlaces=(await call("eo_search",{resource:"food_place",filters:{purpose:"drink"}})).items;
      assert.deepEqual(new Set(drinkPlaces.map(p=>p.id)),new Set([tea.id,place.id]));
      await reject("eo_update",{resource:"food_place",id:tea.id,data:{service_type:"food"}});
      await reject("eo_update",{resource:"drink_log",id:drinks[0].id,data:{food_place_id:place.id}});
      const unchanged=(await call("eo_update",{resource:"drink_log",id:drinks[0].id,data:{notes:"仅备注"}})).item;
      assert.equal(unchanged.drink_menu_id,menu.id);assert.equal(unchanged.temperature,"hot");assert.equal(unchanged.sugar_level,"无糖");
      await call("eo_delete",{resource:"food_dish",id:menu.id});
      assert.equal((await call("eo_search",{resource:"food_dish",filters:{food_place_id:tea.id,kind:"drink"}})).items.length,0);
      await reject("eo_create",{resource:"drink_log",data:{name:"茶",food_place_id:tea.id,drink_menu_id:menu.id}});
      await call("eo_update",{resource:"food_place",id:tea.id,data:{service_type:"food"}});
      assert.equal((await call("eo_update",{resource:"drink_log",id:drinks[0].id,data:{notes:"保留历史"}})).item.drink_menu_id,menu.id);
      await call("eo_update",{resource:"drink_log",id:drinks[0].id,data:{food_place_id:place.id,drink_menu_id:null}});
      const archivedTea=await call("eo_delete",{resource:"food_place",id:tea.id});assert.equal(archivedTea.action,"archived");assert.equal(archivedTea.deleted,false);
      assert.equal((await call("eo_search",{resource:"drink_log",filters:{drink_menu_id:menu.id}})).items[0].food_place_name,"只卖茶");
      for(const d of drinks)await call("eo_delete",{resource:"drink_log",id:d.id});
      assert.equal((await call("eo_search",{resource:"drink_log",filters:{}})).items.length,before.length);
      const rejected=await rpc("tools/call",{name:"eo_update",arguments:{resource:"food_log",id:record.id,data:{food_place_id:other.id}}});assert.equal(rejected.isError,true);
      const {item:cleared}=await call("eo_update",{resource:"food_log",id:record.id,data:{food_dish_ids:[]}});assert.deepEqual(cleared.food_dish_ids,[]);
      const {item:linkedDish}=await call("eo_update",{resource:"food_log",id:record.id,data:{food_dish_ids:[ids[0]]}});assert.deepEqual(linkedDish.food_dish_ids,[ids[0]]);
      assert.equal((await call("eo_delete",{resource:"food_place",id:place.id})).action,"archived");
      assert.equal((await call("eo_search",{resource:"food_log",filters:{food_place_id:place.id}})).items[0].food_place_name,"测试饭店");
      await call("eo_delete",{resource:"drink_log",id:drink.id});
      await call("eo_delete",{resource:"food_log",id:record.id});assert.equal((await call("eo_search",{resource:"food_log",filters:{food_place_id:place.id}})).items.length,0);
      const {item:emptyPlace}=await call("eo_create",{resource:"food_place",data:{name:"误建店"}});
      const {item:emptyDish}=await call("eo_create",{resource:"food_dish",data:{food_place_id:emptyPlace.id,name:"误建菜单"}});
      const deletedPlace=await call("eo_delete",{resource:"food_place",id:emptyPlace.id});assert.equal(deletedPlace.action,"deleted");assert.equal(deletedPlace.deleted,true);
      await reject("eo_get",{resource:"food_place",id:emptyPlace.id});await reject("eo_get",{resource:"food_dish",id:emptyDish.id});
      const {item:retail}=await call("eo_create",{resource:"food_place",data:{name:"零售来源测试",kind:"retail",rating:"love"}});
      assert.equal(retail.scope,"brand");assert.equal(retail.service_type,"both");
      const {item:branch}=await call("eo_update",{resource:"food_place",id:retail.id,data:{scope:"branch",address:"测试街道"}});
      assert.equal(branch.scope,"branch");assert.equal(branch.kind,"retail");assert.equal(branch.address,"测试街道");
      const {item:retailFood}=await call("eo_create",{resource:"food_library",data:{name:"零售酸奶",category:"drink",data_source:"package_label"}});
      const {item:retailLog}=await call("eo_create",{resource:"food_log",data:{title:"酸奶",scene:"packaged_food",food_place_id:retail.id,food_library_items:[{food_library_id:retailFood.id,quantity:null,unit:"serving"}]}});
      const {item:retailDrink}=await call("eo_create",{resource:"drink_log",data:{name:"酸奶",food_place_id:retail.id,food_library_id:retailFood.id}});
      assert.equal(retailLog.food_library_id,retailFood.id);assert.equal(retailDrink.food_library_id,retailFood.id);
      const {item:sourceStats}=await call("eo_get",{resource:"food_place",id:retail.id});
      assert.equal(sourceStats.frequency,2);assert.equal(sourceStats.rating,"love");assert.equal(sourceStats.packaged_food[0].record_count,2);
      assert.equal(sourceStats.packaged_food[0].item.id,retailFood.id);
      assert.equal((await call("eo_search",{resource:"food_place",filters:{kind:"retail",scope:"branch"}})).items[0].id,retail.id);
      assert.equal((await call("eo_update",{resource:"drink_log",id:retailDrink.id,data:{notes:"保留商品关联"}})).item.food_library_id,retailFood.id);
      assert.equal((await rpc("tools/call",{name:"eo_update",arguments:{resource:"food_place",id:retail.id,data:{frequency:99}}})).isError,true);
      await call("eo_delete",{resource:"food_log",id:retailLog.id});await call("eo_delete",{resource:"drink_log",id:retailDrink.id});
      assert.deepEqual((await call("eo_get",{resource:"food_place",id:retail.id})).item.packaged_food,[]);
    } finally {await mcpHandler.close();}
  `;
  try {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "food.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
