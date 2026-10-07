import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("MCP generic contracts preserve schedules, ownership, PATCH and archive semantics end to end", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-mcp-contracts-"));
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  const program = String.raw`
    import assert from "node:assert/strict";
    import {mcpHandler} from "./src/lib/mcp/server.ts";
    import {DatabaseSync} from "node:sqlite";
    import {deleteCatRoutine} from "./src/lib/services/cat-routine.ts";
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
    async function call(name,args={}) {const result=await rpc("tools/call",{name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;}
    async function reject(name,args,pattern) {const result=await rpc("tools/call",{name,arguments:args});assert.equal(result.isError,true,JSON.stringify(result));assert.match(result.content[0].text,pattern);}
    try {
      const tools=(await rpc("tools/list")).tools;
      assert.deepEqual(tools.map(tool=>tool.name).sort(),["eo_resources","eo_schema","eo_search","eo_get","eo_create","eo_update","eo_delete","eo_action"].sort());
      const resources=(await call("eo_resources")).resources;
      assert.equal(resources.length,36);
      for(const resource of resources){const {schema}=await call("eo_schema",{resource:resource.resource});assert.deepEqual(Object.keys(schema.action_schemas).sort(),[...resource.actions].sort());}
      const {item:limit}=await call("eo_create",{resource:"drink_limit",data:{name:"Coffee",target_type:"coffee",period:"daily",limit_value:3}});
      const {item:disabled}=await call("eo_update",{resource:"drink_limit",id:limit.id,data:{enabled:false}});
      assert.equal(disabled.limit_value,3);assert.equal(disabled.target_type,"coffee");assert.equal(disabled.enabled,false);

      const {item:routine}=await call("eo_create",{resource:"cat_routine",data:{scope:"household",title:"Test care",interval_value:7,interval_unit:"day",recurrence_mode:"fixed",anchor_date:"2026-01-01",first_due_date:"2026-01-01",next_due_date:"2026-10-08",configured_reminder_time:"08:15",timezone:"UTC",repeat_while_overdue:true}});
      assert.ok(routine.reminder_id);
      const {item:edited}=await call("eo_update",{resource:"cat_routine",id:routine.id,data:{notes:"Only note"}});
      for(const key of ["recurrence_mode","anchor_date","first_due_date","next_due_date","configured_reminder_time","timezone","first_due_at","next_due_at","repeat_while_overdue","reminder_id"]){assert.deepEqual(edited[key],routine[key],key);}
      const {item:projection}=await call("eo_get",{resource:"reminder",id:routine.reminder_id});
      assert.equal(projection.next_due_at,routine.next_due_at);assert.equal(projection.timezone,"UTC");
      await reject("eo_update",{resource:"reminder",id:routine.reminder_id,data:{title:"Bypass owner"}},/owning module/);
      await reject("eo_action",{resource:"cat_routine",id:routine.id,action:"archive",data:{acted_at:"2026-10-01T00:00:00Z"}},/does not accept/);

      // Generic resources exercise the real services and isolated database.
      const {item:place}=await call("eo_create",{resource:"food_place",data:{name:"Meal source",service_type:"both",city:"成都",location:"商场"}});
      const {item:dish}=await call("eo_create",{resource:"food_dish",data:{food_place_id:place.id,name:"Rice"}});
      const {item:menu}=await call("eo_create",{resource:"food_dish",data:{food_place_id:place.id,kind:"drink",name:"Tea"}});
      const {item:library}=await call("eo_create",{resource:"food_library",data:{name:"Reference",brand:"Brand",reference_type:"per_100g",reference_kcal:200}});
      assert.equal((await call("eo_create",{resource:"food_library",data:{name:"Reference",brand:"Brand",reference_type:"per_100g",reference_kcal:200}})).item.id,library.id);
      assert.equal((await call("eo_search",{resource:"food_library",query:"Ref",filters:{brand:"Brand",category:"other"}})).items[0].id,library.id);
      const {item:meal}=await call("eo_create",{resource:"food_log",data:{title:"Rice",scene:"restaurant",rating:"good",occurred_at:"2026-10-05T12:00:00+08:00",occurred_has_explicit_time:false,food_place_id:place.id,food_dish_ids:[dish.id],food_library_items:[{food_library_id:library.id,quantity:50,unit:"g"}],food_kcal_mode:"auto",calendar_time_enabled:false}});
      assert.equal(meal.estimated_kcal,100);assert.equal(meal.food_library_items[0].nutrition_reference.reference_kcal,200);
      assert.equal(meal.food_place_city,"成都");assert.equal(meal.food_place_location,"商场");assert.deepEqual(meal.food_dish_ids,[dish.id]);
      assert.equal((await call("eo_get",{resource:"food_log",id:meal.id})).item.occurred_has_explicit_time,false);
      assert.equal((await call("eo_search",{resource:"food_log",filters:{date:"2026-10-05",meal_type:"snack",food_dish_id:dish.id}})).items[0].id,meal.id);
      assert.equal((await call("eo_get",{resource:"nutrition_daily",id:"2026-10-05"})).item.estimated_intake_kcal,100);
      await call("eo_update",{resource:"food_library",id:library.id,data:{reference_kcal:300}});
      const {item:noteEdit}=await call("eo_update",{resource:"food_log",id:meal.id,data:{notes:"Preserve snapshot"}});
      assert.deepEqual(noteEdit.food_library_items,meal.food_library_items);assert.equal(noteEdit.estimated_kcal,100);
      assert.equal(noteEdit.occurred_has_explicit_time,false);assert.equal(noteEdit.occurred_at,meal.occurred_at);
      await reject("eo_update",{resource:"food_log",id:meal.id,data:{food_dish_id:dish.id}},/does not accept/);
      await reject("eo_update",{resource:"food_log",id:meal.id,data:{food_library_id:library.id}},/does not accept/);
      await reject("eo_create",{resource:"food_log",data:{title:"Bad snapshot",food_library_items:[{food_library_id:library.id,quantity:50,unit:"g",nutrition_reference:{reference_kcal:1}}]}},/does not accept/);
      await reject("eo_search",{resource:"food_library",filters:{keyword:"Reference"}},/does not accept/);
      await reject("eo_search",{resource:"food_log",filters:{date:"2026-02-30"}},/日期/);
      const {item:another}=await call("eo_create",{resource:"food_place",data:{name:"Another"}});
      await reject("eo_update",{resource:"food_log",id:meal.id,data:{food_place_id:another.id}},/店铺/);
      await call("eo_update",{resource:"food_log",id:meal.id,data:{occurred_at:"2026-10-06T18:30:00+08:00",occurred_has_explicit_time:true}});
      assert.equal((await call("eo_get",{resource:"nutrition_daily",id:"2026-10-05"})).item.estimated_intake_kcal,0);
      assert.equal((await call("eo_get",{resource:"nutrition_daily",id:"2026-10-06"})).item.estimated_intake_kcal,100);
      const {item:cleared}=await call("eo_update",{resource:"food_log",id:meal.id,data:{food_dish_ids:[],food_library_items:[],food_kcal_mode:"manual",estimated_kcal:150}});
      assert.deepEqual(cleared.food_dish_ids,[]);assert.deepEqual(cleared.food_library_items,[]);assert.equal(cleared.food_library_id,null);
      assert.equal(cleared.estimated_kcal,150);

      const {item:drinkLimit}=await call("eo_create",{resource:"drink_limit",data:{name:"Tea daily",target_type:"tea",period:"daily",limit_value:1}});
      const {item:drink}=await call("eo_create",{resource:"drink_log",data:{name:"Placeholder",drink_type:"tea",food_place_id:place.id,drink_menu_id:menu.id,food_library_id:library.id,occurred_at:"2026-10-06T12:00:00+08:00",occurred_has_explicit_time:false,sugar_level:"无糖",temperature:"hot",caffeine_mg:0,estimated_kcal:50}});
      assert.equal(drink.name,"Tea");assert.equal(drink.caffeine_mg,0);
      assert.ok(drink.limits.some(status=>status.limit.id===drinkLimit.id));
      assert.equal((await call("eo_get",{resource:"drink_log",id:drink.id})).item.occurred_has_explicit_time,false);
      assert.equal((await call("eo_search",{resource:"drink_log",query:"Tea",filters:{date:"2026-10-06",drink_menu_id:menu.id}})).items[0].id,drink.id);
      const {item:drinkPatch}=await call("eo_update",{resource:"drink_log",id:drink.id,data:{notes:"Only note"}});
      for(const key of ["food_place_id","drink_menu_id","food_library_id","occurred_at","occurred_has_explicit_time","temperature","sugar_level","caffeine_mg"])assert.deepEqual(drinkPatch[key],drink[key],key);
      assert.ok(Array.isArray(drinkPatch.limits));
      await reject("eo_update",{resource:"drink_log",id:drink.id,data:{drink_menu_id:dish.id}},/菜单/);
      assert.equal((await call("eo_delete",{resource:"food_library",id:library.id})).action,"archived");
      assert.equal((await call("eo_get",{resource:"food_library",id:library.id})).item.reference_kcal,300);
      assert.equal((await call("eo_search",{resource:"food_library",query:"Ref"})).items.length,0);
      assert.equal((await call("eo_update",{resource:"drink_log",id:drink.id,data:{notes:"Archived link remains"}})).item.food_library_id,library.id);
      await call("eo_update",{resource:"drink_log",id:drink.id,data:{food_library_id:null,drink_menu_id:null,food_place_id:null}});
      const {item:emptyLibrary}=await call("eo_create",{resource:"food_library",data:{name:"Unused"}});
      assert.equal((await call("eo_delete",{resource:"food_library",id:emptyLibrary.id})).deleted,true);
      await reject("eo_get",{resource:"food_library",id:emptyLibrary.id},/not found/);

      const energy=await call("eo_action",{resource:"daily_energy",id:"2026-10-06",action:"upsert",data:{resting_energy_kcal:1200,active_energy_kcal:300,notes:"Manual"}});
      assert.equal(energy.result.estimated_intake_kcal,200);assert.equal(energy.result.total_expenditure_kcal,1500);
      assert.equal(energy.result.manual_resting_energy_kcal,1200);assert.equal(energy.result.resting_energy_source,"manual");
      assert.equal((await call("eo_get",{resource:"daily_energy",id:"2026-10-06"})).item.notes,"Manual");
      await reject("eo_action",{resource:"daily_energy",id:"2026-10-06",action:"upsert",data:{resting_energy_kcal:1000}},/requires data.active_energy_kcal/);
      await reject("eo_update",{resource:"daily_energy",id:"2026-10-06",data:{notes:"PATCH"}},/does not support/);
      await reject("eo_action",{resource:"daily_energy",id:"2026-02-30",action:"upsert",data:{resting_energy_kcal:null,active_energy_kcal:null}},/日期/);
      await call("eo_action",{resource:"daily_energy",id:"2026-10-06",action:"upsert",data:{resting_energy_kcal:null,active_energy_kcal:0}});
      const {item:manual}=await call("eo_get",{resource:"daily_energy",id:"2026-10-06"});
      assert.equal(manual.resting_energy_kcal,null);assert.equal(manual.active_energy_kcal,0);assert.equal(manual.notes,"");
      await call("eo_delete",{resource:"drink_log",id:drink.id});await call("eo_delete",{resource:"food_log",id:meal.id});
      assert.equal((await call("eo_get",{resource:"nutrition_daily",id:"2026-10-06"})).item.estimated_intake_kcal,0);
      await reject("eo_get",{resource:"food_log",id:meal.id},/not found/);
      await reject("eo_get",{resource:"drink_log",id:drink.id},/not found/);

      const {item:calendarMeal}=await call("eo_create",{resource:"calendar_event",data:{title:"🍚吃饭饭",start_at:"2026-10-09T12:09:00+08:00",end_at:"2026-10-09T12:26:00+08:00",is_all_day:false,status:"confirmed"}});
      const {item:matched}=await call("eo_create",{resource:"food_log",data:{title:"Calendar lunch",meal_type:"lunch",occurred_at:"2026-10-09T12:30:00+08:00"}});
      assert.equal(matched.occurred_at,calendarMeal.start_at);assert.equal(matched.calendar_meal.id,calendarMeal.id);
      assert.equal((await call("eo_get",{resource:"food_log",id:matched.id})).item.occurred_at,calendarMeal.start_at);
      assert.equal((await call("eo_search",{resource:"food_log",filters:{date:"2026-10-09"}})).items[0].occurred_at,calendarMeal.start_at);
      const {item:matchedPatch}=await call("eo_update",{resource:"food_log",id:matched.id,data:{notes:"Keep original time",occurred_at:matched.occurred_at,occurred_has_explicit_time:true}});
      assert.equal(matchedPatch.original_occurred_at,matched.original_occurred_at);
      const {item:manualTime}=await call("eo_update",{resource:"food_log",id:matched.id,data:{occurred_at:"2026-10-09T14:00:00+08:00"}});
      assert.equal(manualTime.calendar_time_enabled,false);assert.equal(manualTime.occurred_at,"2026-10-09T06:00:00.000Z");
      await call("eo_delete",{resource:"food_log",id:matched.id});

      const {item:one}=await call("eo_create",{resource:"tracker",data:{name:"One"}});
      const {item:two}=await call("eo_create",{resource:"tracker",data:{name:"Two"}});
      const {result:entry}=await call("eo_action",{resource:"tracker",id:one.id,action:"create_entry",data:{note:"Keep"}});
      await reject("eo_action",{resource:"tracker",id:two.id,action:"update_entry",data:{entry_id:entry.id,note:"Wrong parent"}},/not found in this Tracker/);
      await reject("eo_action",{resource:"tracker",id:two.id,action:"delete_entry",data:{child_id:entry.id}},/not found in this Tracker/);
      const {result:goal}=await call("eo_action",{resource:"tracker",id:one.id,action:"create_goal",data:{period_type:"custom",custom_period:"Quarter",target_value:4}});
      assert.equal(goal.custom_period,"Quarter");
      await reject("eo_action",{resource:"tracker",id:one.id,action:"create_goal",data:{field_id:1}},/does not accept/);
      const {result:rule}=await call("eo_action",{resource:"tracker",id:one.id,action:"create_reminder",data:{reminder_mode:"standard",configured_time:"09:27",period_days:7,anchor_date:"2026-10-20",timezone:"UTC"}});
      assert.equal(rule.reminder_mode,"standard");assert.equal(rule.configured_time,"09:27");assert.equal(rule.period_days,7);assert.equal(rule.timezone,"UTC");
      const {result:legacy}=await call("eo_action",{resource:"tracker",id:two.id,action:"create_reminder",data:{reminder_type:"interval",time_of_day:"10:33",interval_days:3,anchor_date:"2026-10-20",timezone:"UTC"}});
      assert.equal(legacy.reminder_mode,"missing");assert.equal(legacy.configured_time,"10:33");assert.equal(legacy.period_days,3);
      await reject("eo_action",{resource:"tracker",id:one.id,action:"create_reminder",data:{days_of_week:[1]}},/does not accept/);
      const {result:updated}=await call("eo_action",{resource:"tracker",id:one.id,action:"update_entry",data:{entry_id:entry.id,note:"Correct parent"}});
      assert.equal(updated.note,"Correct parent");

      const {item:task}=await call("eo_create",{resource:"task",data:{title:"Task",due_date:"2026-10-20",due_time:"09:15",remind_mode:"at_due"}});
      assert.ok((await call("eo_search",{resource:"reminder",filters:{target_type:"task"}})).items.some(item=>item.source_id===task.id));
      await call("eo_action",{resource:"cat_routine",id:routine.id,action:"complete",data:{acted_at:"2026-10-07T09:00:00Z"}});
      const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      try {
        const count=(table,column,id)=>Number(db.prepare("SELECT COUNT(*) AS n FROM "+table+" WHERE "+column+"=?").get(id).n);
        assert.equal(count("reminder_occurrences","reminder_id",routine.reminder_id),1);
        const archived=await call("eo_action",{resource:"cat_routine",id:routine.id,action:"archive"});
        assert.deepEqual(archived.result,{archived:true,id:routine.id});
        assert.equal((await call("eo_get",{resource:"cat_routine",id:routine.id})).item.enabled,false);
        assert.equal((await call("eo_get",{resource:"reminder",id:routine.reminder_id})).item.is_active,false);
        assert.equal(count("reminder_occurrences","reminder_id",routine.reminder_id),1);
        assert.equal(count("cat_events","source_id",routine.id),1);
        const deleted=await call("eo_delete",{resource:"cat_routine",id:routine.id});
        assert.deepEqual(deleted,{resource:"cat_routine",deleted:true,id:routine.id});
        assert.equal(count("cat_routines","id",routine.id),0);
        assert.equal(count("reminders","id",routine.reminder_id),0);
        assert.equal(count("reminder_occurrences","reminder_id",routine.reminder_id),0);
        assert.equal(count("cat_events","source_id",routine.id),1);
        assert.equal(count("notification_deliveries","source_id",routine.id),1);
        await reject("eo_get",{resource:"cat_routine",id:routine.id},/not found/);
        await reject("eo_delete",{resource:"cat_routine",id:routine.id},/not found/);
        const {item:webRoutine}=await call("eo_create",{resource:"cat_routine",data:{scope:"household",title:"Web deletion",interval_value:1,interval_unit:"week",first_due_date:"2026-10-08",configured_reminder_time:"08:15"}});
        assert.equal(await withMcpRequestRepository({userId:"local",accessToken:"isolated-test"},()=>deleteCatRoutine(webRoutine.id)),true);
        assert.equal(await withMcpRequestRepository({userId:"local",accessToken:"isolated-test"},()=>deleteCatRoutine(webRoutine.id)),false);
        assert.equal(count("cat_routines","id",webRoutine.id),0);
        assert.equal(count("reminders","id",webRoutine.reminder_id),0);
      } finally {db.close();}
      const {item:cat}=await call("eo_create",{resource:"cat_pet",data:{name:"Cat"}});
      assert.equal((await call("eo_delete",{resource:"cat_pet",id:cat.id})).action,"archived");
      assert.equal((await call("eo_search",{resource:"cat_pet",filters:{include_inactive:true}})).items.find(item=>item.id===cat.id).is_active,false);
    } finally {await mcpHandler.close();}
  `;
  try {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], {
      cwd: process.cwd(), encoding: "utf8", timeout: 30000,
      env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "contracts.db"), VERCEL: "" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
