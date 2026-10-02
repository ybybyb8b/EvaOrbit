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
      for(const name of ["food_create","food_update"])assert.equal(tools.find(t=>t.name===name).inputSchema.properties.food_dish_ids.type,"array");
      assert.ok(tools.find(t=>t.name==="food_search_recent").inputSchema.properties.food_dish_id);
      const {schema}=await call("eo_schema",{resource:"food_place"});
      for(const field of ["city","location","category"])assert.ok(schema.writable_fields.includes(field));
      const {item:place}=await call("eo_create",{resource:"food_place",data:{name:"测试饭店",city:"成都",location:"高新区",category:"川菜"}});
      assert.equal(place.city,"成都");assert.equal(place.location,"高新区");
      const {item:updated}=await call("eo_update",{resource:"food_place",id:place.id,data:{location:"天府和悦",category:"快餐"}});assert.equal(updated.location,"天府和悦");
      const {items:places}=await call("eo_search",{resource:"food_place",query:"天府和悦",filters:{category:"快餐"}});assert.equal(places[0].id,place.id);
      const ids=[];
      for(const name of ["鸡腿饭","紫菜汤"]){const {item}=await call("eo_create",{resource:"food_dish",data:{food_place_id:place.id,name,category:"午餐"}});ids.push(item.id);}
      const {items:dishes}=await call("eo_search",{resource:"food_dish",query:"汤",filters:{food_place_id:place.id}});assert.equal(dishes[0].id,ids[1]);
      const {record}=await call("food_create",{title:"午餐",food_place_id:place.id,food_dish_ids:ids});
      assert.deepEqual(record.food_dish_ids,ids);assert.deepEqual(record.food_dishes.map(d=>d.name),["鸡腿饭","紫菜汤"]);
      assert.equal(record.food_place_city,"成都");assert.equal(record.food_place_location,"天府和悦");
      const {records}=await call("food_search_recent",{food_place_id:place.id,food_dish_id:ids[1]});assert.equal(records[0].id,record.id);
      const {record:renamed}=await call("food_update",{id:record.id,title:"修改午餐"});assert.deepEqual(renamed.food_dish_ids,ids);
      const {record:reordered}=await call("food_update",{id:record.id,food_dish_ids:[ids[1],ids[0]]});assert.deepEqual(reordered.food_dish_ids,[ids[1],ids[0]]);
      const {item:other}=await call("eo_create",{resource:"food_place",data:{name:"别家店"}});
      const rejected=await rpc("tools/call",{name:"food_update",arguments:{id:record.id,food_place_id:other.id}});assert.equal(rejected.isError,true);
      const {record:cleared}=await call("food_update",{id:record.id,food_dish_ids:[]});assert.deepEqual(cleared.food_dish_ids,[]);
      const {record:legacy}=await call("food_update",{id:record.id,food_dish_id:ids[0]});assert.deepEqual(legacy.food_dish_ids,[ids[0]]);
      await call("food_delete",{id:record.id});assert.equal((await call("food_search_recent",{food_place_id:place.id})).records.length,0);
    } finally {await mcpHandler.close();}
  `;
  try {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "food.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
