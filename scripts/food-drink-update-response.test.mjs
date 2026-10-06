import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

test("Supabase food and drink creates and updates hydrate committed associations rather than mutation snapshots",()=>{
 const program=String.raw`
  import assert from "node:assert/strict";
  import {createMcpSupabaseRepository} from "./src/lib/repositories/supabase.ts";
  const base={id:1,occurred_at:"2026-10-04T12:00:00+08:00",occurred_has_explicit_time:false,food_place_id:null,created_at:"2026-10-04",updated_at:"2026-10-04",confidence:"low",estimated_kcal:null,kcal_min:null,kcal_max:null};
  const rows={food_logs:{...base,title:"晚餐",meal_type:"dinner",scene:"restaurant",food_dish_ids:[],food_dish_id:null},drink_logs:{...base,name:"茶",brand:"",drink_type:"tea",drink_menu_id:null,sugar_level:"无糖",temperature:"hot",volume_ml:null,caffeine_mg:null,food_library_id:null,notes:""}};
  const requests=[];
  globalThis.fetch=async(input,init)=>{
   const url=new URL(input),table=url.pathname.split('/').at(-1),method=init?.method??"GET";requests.push({table,method,select:url.searchParams.get("select")});
   if(table==="food_dishes")return Response.json([{id:11,name:"饭"},{id:12,name:"汤"}]);
   const row=rows[table];assert.ok(row);
   if(url.searchParams.get("id")==="eq.999")return Response.json([]);
   if(method==="POST"){
    const payload=JSON.parse(init.body);if(payload.notes==="fail")return Response.json({message:"test write failure"},{status:500});Object.assign(row,payload);
    // INSERT representations may omit associations; persisted state must be read back.
    return Response.json(url.searchParams.get("select")==="id"?{id:row.id}:{...row,food_place_id:null,food_dish_id:null,food_dish_ids:[],drink_menu_id:null});
   }
   if(method==="PATCH"){
    const before=structuredClone(row),patch=JSON.parse(init.body);if(patch.notes==="fail")return Response.json({message:"test write failure"},{status:500});Object.assign(row,patch);
    // Model a stale relational mutation response; a new SELECT observes the committed row.
    return Response.json([url.searchParams.get("select")==="id"?{id:row.id}:before]);
   }
   assert.equal(method,"GET");return Response.json([{...row,food_places:row.food_place_id?{name:"新店",city:"成都",branch:"一店",location:"高新区"}:null,food_dishes:row.drink_menu_id?{name:"奶茶"}:null}]);
  };
  const repo=await createMcpSupabaseRepository("test-token","test-owner");
  const createdFood=await repo.createFoodLog({title:"午餐",foodPlaceId:7,foodDishIds:[11,12],foodDishId:11,occurredHasExplicitTime:false});
  assert.equal(createdFood.foodPlaceId,7);assert.deepEqual(createdFood.foodDishIds,[11,12]);assert.equal(createdFood.foodDishId,11);assert.equal(createdFood.foodPlaceName,"新店");assert.deepEqual(createdFood.foodDishes.map(d=>d.name),["饭","汤"]);assert.deepEqual(createdFood,await repo.getFoodLog(createdFood.id));
  const createdDrink=await repo.createDrinkLog({name:"奶茶",foodPlaceId:7,drinkMenuId:15,occurredHasExplicitTime:false});assert.equal(createdDrink.foodPlaceId,7);assert.equal(createdDrink.drinkMenuId,15);assert.equal(createdDrink.drinkMenuName,"奶茶");assert.deepEqual(createdDrink,await repo.getDrinkLog(createdDrink.id));
  for(const create of [repo.createFoodLog,repo.createDrinkLog])await assert.rejects(()=>create({notes:"fail"}),/test write failure/);
  const food=await repo.updateFoodLog(1,{foodPlaceId:7,foodDishIds:[11,12],foodDishId:11});
  assert.equal(food.foodPlaceId,7);assert.equal(food.foodPlaceName,"新店");assert.deepEqual(food.foodDishIds,[11,12]);assert.deepEqual(food.foodDishes.map(d=>d.name),["饭","汤"]);assert.equal(food.occurredHasExplicitTime,false);
  assert.deepEqual(food,await repo.getFoodLog(1));
  const cleared=await repo.updateFoodLog(1,{foodPlaceId:null,foodDishIds:[],foodDishId:null});assert.equal(cleared.foodPlaceId,null);assert.deepEqual(cleared.foodDishIds,[]);assert.deepEqual(cleared.foodDishes,[]);
  const drink=await repo.updateDrinkLog(1,{foodPlaceId:7,drinkMenuId:15,name:"奶茶"});assert.equal(drink.foodPlaceId,7);assert.equal(drink.drinkMenuId,15);assert.equal(drink.drinkMenuName,"奶茶");assert.equal(drink.foodPlaceName,"新店");assert.equal(drink.sugarLevel,"无糖");assert.equal(drink.temperature,"hot");assert.equal(drink.occurredHasExplicitTime,false);
  assert.deepEqual(drink,await repo.getDrinkLog(1));
  const noMenu=await repo.updateDrinkLog(1,{foodPlaceId:null,drinkMenuId:null});assert.equal(noMenu.foodPlaceId,null);assert.equal(noMenu.drinkMenuId,null);assert.equal(noMenu.drinkMenuName,null);
  for(const update of [repo.updateFoodLog,repo.updateDrinkLog]){assert.equal(await update(999,{notes:"missing"}),null);await assert.rejects(()=>update(1,{notes:"fail"}),/test write failure/);}
  for(const request of requests.filter(r=>r.method==="PATCH"||r.method==="POST"))assert.equal(request.select,"id");
 `;
 const loader=pathToFileURL(path.join(process.cwd(),"scripts/typescript-test-loader.mjs")).href;
 const result=spawnSync(process.execPath,["--conditions=react-server","--experimental-loader",loader,"--input-type=module","--eval",program],{encoding:"utf8",timeout:30000,env:{...process.env,SUPABASE_URL:"http://supabase.test",SUPABASE_PUBLISHABLE_KEY:"test-key"}});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
