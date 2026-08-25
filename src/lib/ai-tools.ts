import { createMemory, createTask, getTask, listMemories, listTasks, updateTask } from "./services/evaorbit";
import { convertInbox, createInbox, listInbox } from "./services/inbox";
import { createFoodLog, getTodayFood, listFoodLogs, searchFoodLibrary, updateFoodLog, upsertFoodLibraryItem } from "./services/food";
import { checkDrinkLimits, createDrinkLimit, createDrinkLog, getDrinkLimits, getTodayDrinks, updateDrinkLog } from "./services/drink";
import { getDailyNutritionSummary } from "./services/nutrition";
import { parseDrinkLimit, parseDrinkLogPatch, parseFoodLibraryItem, parseFoodLogPatch, parseInboxConversion, parseNewDrinkLog, parseNewFoodLog, parseNewInbox, parseNewMemory, parseNewTask, parseTaskPatch, ValidationError } from "./validation.ts";

type ToolResult = { result: string; summary: string; wrote: boolean };

function argsObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("工具参数格式不正确");
  return value as Record<string, unknown>;
}

function positiveId(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new ValidationError("ID 格式不正确"); return value as number; }

export async function executeAiTool(name: string, value: unknown, allowWrite: boolean): Promise<ToolResult> {
  const args = argsObject(value);
  if (name === "list_tasks") {
    const status = args.status === "open" || args.status === "done" ? args.status : "all";
    const tasks = (await listTasks(status)).slice(0, 100);
    return { result: JSON.stringify({ count: tasks.length, tasks }), summary: `读取了 ${tasks.length} 条任务`, wrote: false };
  }
  if (name === "search_memories") {
    const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
    const category = typeof args.category === "string" ? args.category.trim().slice(0, 40) : "";
    const memories = (await listMemories(query, category)).slice(0, 100);
    return { result: JSON.stringify({ count: memories.length, memories }), summary: `检索到 ${memories.length} 条记忆`, wrote: false };
  }
  if (name === "list_inbox") { const status=typeof args.status==="string"?args.status:"inbox";const items=(await listInbox(status)).slice(0,100);return{result:JSON.stringify({count:items.length,items}),summary:`读取了 ${items.length} 条 Inbox`,wrote:false}; }
  if (name === "get_today_food") { const logs=await getTodayFood();return{result:JSON.stringify({count:logs.length,logs}),summary:`读取了今天 ${logs.length} 条饮食记录`,wrote:false}; }
  if (name === "search_food_logs") { const logs=(await listFoodLogs({date:typeof args.date==="string"?args.date:undefined,query:typeof args.query==="string"?args.query:"",mealType:typeof args.mealType==="string"?args.mealType:undefined})).slice(0,100);return{result:JSON.stringify({count:logs.length,logs}),summary:`检索到 ${logs.length} 条饮食记录`,wrote:false}; }
  if (name === "search_food_library") { const items=(await searchFoodLibrary(typeof args.query==="string"?args.query:"",typeof args.brand==="string"?args.brand:"")).slice(0,100);return{result:JSON.stringify({count:items.length,items,brandRule:"品牌不同时不得默认等价"}),summary:`Food Library 找到 ${items.length} 条`,wrote:false}; }
  if (name === "get_today_drinks") { const logs=await getTodayDrinks();return{result:JSON.stringify({count:logs.length,logs}),summary:`读取了今天 ${logs.length} 条饮品记录`,wrote:false}; }
  if (name === "get_drink_limits") { const limits=await getDrinkLimits();return{result:JSON.stringify({count:limits.length,limits}),summary:`读取了 ${limits.length} 条饮品限制`,wrote:false}; }
  if (name === "check_drink_limit") { const limits=await checkDrinkLimits();return{result:JSON.stringify({limits}),summary:"检查了饮品限制",wrote:false}; }
  if (name === "get_daily_nutrition_summary") { const summary=await getDailyNutritionSummary(typeof args.date==="string"?args.date:undefined);return{result:JSON.stringify(summary),summary:`汇总了 ${summary.date} 的摄入`,wrote:false}; }
  if (!allowWrite) {
    return { result: JSON.stringify({ error: "AI 写入权限未开启。请让用户前往设置启用后再试。" }), summary: "写入被权限设置阻止", wrote: false };
  }
  if (name === "create_task") {
    const task = await createTask(parseNewTask(args));
    return { result: JSON.stringify({ success: true, task }), summary: `已创建任务「${task.title}」`, wrote: true };
  }
  if (name === "complete_task") {
    const id = args.id;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) throw new ValidationError("任务 ID 格式不正确");
    const task = await getTask(id as number);
    if (!task) return { result: JSON.stringify({ error: "任务不存在" }), summary: "未找到要完成的任务", wrote: false };
    const updated = await updateTask(task.id, parseTaskPatch({ completed: true }));
    return { result: JSON.stringify({ success: true, task: updated }), summary: `已完成任务「${task.title}」`, wrote: true };
  }
  if (name === "create_memory") {
    const memory = await createMemory(parseNewMemory(args));
    return { result: JSON.stringify({ success: true, memory }), summary: `已保存记忆「${memory.title}」`, wrote: true };
  }
  if(name==="create_inbox"){const item=await createInbox(parseNewInbox({...args,source:typeof args.source==="string"?args.source:"eva"}));return{result:JSON.stringify({success:true,item}),summary:"已放进 Inbox",wrote:true};}
  if(name==="convert_inbox_item"){const id=positiveId(args.id);const{target}=parseInboxConversion(args);const converted=await convertInbox(id,target);return{result:JSON.stringify(converted?{success:true,...converted}:{error:"Inbox 条目不存在"}),summary:converted?`已把 Inbox 整理成${target==="task"?"待办":" Memory"}`:"未找到 Inbox 条目",wrote:Boolean(converted)};}
  if(name==="create_food_log"){const log=await createFoodLog(parseNewFoodLog(args));return{result:JSON.stringify({success:true,log}),summary:`已记录${log.title}`,wrote:true};}
  if(name==="update_food_log"){const id=positiveId(args.id);const patch={...args};delete patch.id;const log=await updateFoodLog(id,parseFoodLogPatch(patch));return{result:JSON.stringify(log?{success:true,log}:{error:"饮食记录不存在"}),summary:log?`已修正${log.title}`:"未找到饮食记录",wrote:Boolean(log)};}
  if(name==="upsert_food_library_item"){const item=await upsertFoodLibraryItem(parseFoodLibraryItem(args));return{result:JSON.stringify({success:true,item}),summary:`Food Library 已保存「${item.name}」`,wrote:true};}
  if(name==="create_drink_log"){const result=await createDrinkLog(parseNewDrinkLog(args));return{result:JSON.stringify({success:true,...result}),summary:`已记录${result.drink.name}`,wrote:true};}
  if(name==="update_drink_log"){const id=positiveId(args.id);const patch={...args};delete patch.id;const result=await updateDrinkLog(id,parseDrinkLogPatch(patch));return{result:JSON.stringify(result?{success:true,...result}:{error:"饮品记录不存在"}),summary:result?`已修正${result.drink.name}`:"未找到饮品记录",wrote:Boolean(result)};}
  if(name==="create_drink_limit"){const limit=await createDrinkLimit(parseDrinkLimit(args));return{result:JSON.stringify({success:true,limit}),summary:`已设置「${limit.name}」`,wrote:true};}
  return { result: JSON.stringify({ error: `不支持的工具：${name}` }), summary: `无法调用工具 ${name}`, wrote: false };
}
