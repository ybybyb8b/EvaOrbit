import assert from "node:assert/strict";
import test from "node:test";
import { ResourceRegistry } from "./mcp/resource-registry.ts";
import { importantDateResources,type ImportantDateResourceOperations } from "./mcp/important-date-resources.ts";
import { buildAgentPermissions,parseAgentPolicy,allowsAgentCall,legacyChatGptPolicy } from "./mcp/agent-policy.ts";
import { parseImportantDate } from "./important-dates-validation.ts";
import type { ImportantDate } from "./important-dates.ts";

function fixture(){
  const rows=new Map<number,ImportantDate>(),colors=new Map<string,string|null>();let nextId=1;
  const fresh=(row:ImportantDate)=>({...row,categoryColor:colors.get(row.category)??null});
  const ops:ImportantDateResourceOperations={
    async list(){return [...rows.values()].map(fresh);},async get(id){const row=rows.get(id);return row?fresh(row):null;},
    async save(id,value){const input=parseImportantDate(value);if(id!==null&&!rows.has(id))return null;if(input.category&&input.categoryColor!==undefined)colors.set(input.category,input.categoryColor);const row={...input,id:id??nextId++,createdAt:"created",updatedAt:"updated"};rows.set(row.id,row);return fresh(row);},
    async remove(id){return rows.delete(id);},async categories(){return [...colors].map(([name,color])=>({name,color}));},
  };
  return {registry:new ResourceRegistry(importantDateResources(ops)),ops};
}

test("Days resources publish complete Gregorian/lunar schemas, read-only categories and explicit consent grants",async()=>{
  const {registry}=fixture(),schema=registry.schema("important_date");
  assert.ok(schema.writable_fields.includes("count_mode"));assert.equal(schema.fields.background.properties?.image.write_only,true);
  assert.deepEqual(schema.supported_actions,["pin","unpin","archive","restore"]);
  assert.equal(schema.search_schema.pagination,"cursor");assert.equal(schema.fields.lunar.properties?.leap.type,"boolean");
  assert.equal(schema.fields.remaining_days.read_only,true);assert.match(schema.fields.category_color.description,/EVERY/);
  assert.deepEqual(registry.resources().find(item=>item.resource==="important_date_category")?.capabilities,["search","get"]);
  const catalog=buildAgentPermissions(registry.resources()),none=parseAgentPolicy({},catalog);
  assert.equal(allowsAgentCall(none,catalog,{resource:"important_date",operation:"create"}),false);
  const legacy=legacyChatGptPolicy(catalog);assert.equal(legacy.permissions.length,0);
  const reader=parseAgentPolicy({permissions:["important_date:search","important_date:get","important_date_category:search"]},catalog);
  assert.equal(allowsAgentCall(reader,catalog,{resource:"important_date",operation:"get",id:1}),true);
  assert.equal(allowsAgentCall(reader,catalog,{resource:"important_date",operation:"action",action:"archive",id:1}),false);
  assert.ok(catalog.filter(item=>item.resource.startsWith("important_date")).every(item=>item.sensitive));
  for(const action of schema.supported_actions){await assert.rejects(()=>registry.action("important_date",{action,data:{}}),/requires an id/);await assert.rejects(()=>registry.action("important_date",{action,id:1,data:{note:"unexpected"}}),/does not accept/);}
});

test("MCP creates and patches lunar dates without dropping rules or replaying shared colors",async()=>{
  const {registry}=fixture();
  const created=await registry.create("important_date",{title:"农历生日",calendar:"lunar",lunar:{year:2025,month:6,day:1,leap:true},lunar_leap_policy:"skip",recurrence:"yearly",category:"生日",category_color:"#75846F",note:"保留原始年份",reminder_time:"09:30",reminder_days_before:1});
  assert.equal(created.date,"2025-07-25");
  const ordinal=await registry.create("important_date",{title:"Ordinal",date:"2016-05-28",display_mode:"elapsed",count_mode:"ordinal",background:{kind:"gradient",color:"#718597",secondary:"#75846F"}});
  assert.equal(ordinal.count_mode,"ordinal");assert.equal(ordinal.day_number,Number(ordinal.elapsed_days)+1);
  const ordinalPatch=await registry.update("important_date",ordinal.id as number,{note:"Keep display settings"});assert.equal(ordinalPatch.count_mode,"ordinal");assert.equal(ordinalPatch.display_mode,"elapsed");assert.deepEqual(ordinalPatch.background,ordinal.background);
  for(const recurrence of ["weekly","monthly"]){const repeated=await registry.create("important_date",{title:"Recurring",date:"2025-01-31",recurrence,display_mode:"countdown",count_mode:"ordinal"});assert.equal(repeated.recurrence,recurrence);const found=await registry.search("important_date",{filters:{recurrence,as_of:"2025-02-01"},limit:20});assert.ok(found.items.some(item=>item.id===repeated.id));}
  const sibling=await registry.create("important_date",{title:"另一生日",date:"2000-01-01",category:"生日"});
  await registry.update("important_date",sibling.id as number,{category_color:"#718597"});
  const renamed=await registry.update("important_date",created.id as number,{title:"妈妈生日"});
  assert.equal(renamed.category_color,"#718597");assert.equal(renamed.reminder_time,"09:30");assert.equal(renamed.lunar_leap_policy,"skip");assert.equal(renamed.note,"保留原始年份");
  const changed=await registry.update("important_date",created.id as number,{lunar:{year:2025,month:6,day:2,leap:true}});assert.equal(changed.date,"2025-07-26");
  await assert.rejects(()=>registry.update("important_date",created.id as number,{lunar:{day:3}}),/农历日期格式/);
  await assert.rejects(()=>registry.update("important_date",created.id as number,{date:"2025-07-27"}),/农历与公历/);
  const solar=await registry.update("important_date",created.id as number,{calendar:"solar"});assert.equal(solar.date,"2025-07-26");assert.equal(solar.lunar,null);
  const restored=await registry.update("important_date",created.id as number,{calendar:"lunar"});assert.deepEqual(restored.lunar,{year:2025,month:6,day:2,leap:true});
  for(const action of ["pin","unpin","archive","restore"]){const item=await registry.action("important_date",{id:created.id as number,action,data:{}});assert.equal(item.pinned,action==="pin");assert.equal(item.archived,action==="archive");assert.equal(item.reminder_time,"09:30");}
  const categories=await registry.search("important_date_category",{query:"生日"});assert.equal(categories.items.length,1);assert.equal(categories.items[0].color,"#718597");assert.equal(categories.items[0].active_count,2);
  assert.equal((await registry.get("important_date_category","生日")).name,"生日");
  await registry.update("important_date",created.id as number,{category_color:null});assert.equal((await registry.get("important_date",sibling.id as number)).category_color,null);
  assert.equal((await registry.delete("important_date",created.id as number)).deleted,true);
  await assert.rejects(()=>registry.get("important_date",created.id as number),/not found/);
});

test("Days search filters next real occurrences, freezes reference days and traverses every page",async()=>{
  const {registry}=fixture();
  const lunar=await registry.create("important_date",{title:"农历生日",calendar:"lunar",lunar:{year:2025,month:6,day:1,leap:true},recurrence:"yearly",category:"生日"});
  const next=await registry.search("important_date",{filters:{as_of:"2027-07-04",from:"2027-07-04",to:"2027-07-04",calendar:"lunar"}});
  assert.equal(next.items.length,1);assert.equal(next.items[0].id,lunar.id);assert.equal(next.items[0].remaining_days,0);assert.equal(next.items[0].anniversary_years,2);
  await registry.action("important_date",{id:lunar.id as number,action:"archive",data:{}});
  assert.equal((await registry.search("important_date",{})).items.length,0);assert.equal((await registry.search("important_date",{filters:{status:"archived"}})).items.length,1);
  for(let i=0;i<105;i++)await registry.create("important_date",{title:`Day ${i}`,date:"2030-01-01",category:"分页"});
  let cursor:string|undefined,first:string|undefined;const ids:number[]=[];
  do{const result=await registry.search("important_date",{query:"Day",filters:{as_of:"2027-07-04",category:"分页"},limit:17,cursor});ids.push(...result.items.map(item=>Number(item.id)));first??=result.next_cursor??undefined;cursor=result.next_cursor??undefined;assert.ok(result.items.every(item=>item.calculated_for==="2027-07-04"));}while(cursor);
  assert.equal(ids.length,105);assert.equal(new Set(ids).size,105);
  assert.ok((await registry.search("important_date",{query:"Day",filters:{category:"分页"},limit:17,cursor:first})).items.every(item=>item.calculated_for==="2027-07-04"));
  await assert.rejects(()=>registry.search("important_date",{query:"different",filters:{category:"分页"},cursor:first}),/same query/);
  await assert.rejects(()=>registry.search("important_date_category",{cursor:first}),/same query/);
  for(const filters of [{pinned:"yes"},{status:"hidden"},{from:"2027-02-30"},{from:"2027-07-05",to:"2027-07-04"},{user_id:"another"}])await assert.rejects(()=>registry.search("important_date",{filters}),/Invalid important_date filters/);
});

test("Days MCP rejects unknown/readonly input, invalid times and mutations to the category catalog",async()=>{
  const {registry}=fixture();
  for(const data of [{title:"No date"},{title:"Bad time",date:"2027-01-01",reminder_time:"24:00"},{title:"Read-only",date:"2027-01-01",remaining_days:3},{title:"DB fields",date:"2027-01-01",user_id:"other"}])await assert.rejects(()=>registry.create("important_date",data));
  const item=await registry.create("important_date",{title:"A date",date:"2027-01-01"});
  await assert.rejects(()=>registry.update("important_date",item.id as number,{}),/要修改/);
  await assert.rejects(()=>registry.update("important_date",item.id as number,{updated_at:"now"}),/Unknown/);
  await assert.rejects(()=>registry.update("important_date",item.id as number,{category_color:"red"}),/分类颜色/);
  await assert.rejects(()=>registry.create("important_date_category",{name:"x"}),/does not support create/);
  await assert.rejects(()=>registry.search("important_date_category",{filters:{color:"#ffffff"}}),/no filters/);
});
