import { createInbox, listInbox } from "./services/inbox";
import { createFoodLog, getTodayFood, listFoodLogs, searchFoodLibrary, updateFoodLog, upsertFoodLibraryItem } from "./services/food";
import { checkDrinkLimits, createDrinkLimit, createDrinkLog, getDrinkLimits, getTodayDrinks, updateDrinkLog } from "./services/drink";
import { getDailyNutritionSummary } from "./services/nutrition";
import { listTimeline } from "./services/timeline";
import { createTracker, createTrackerEntry, getTrackerDetail, listTrackerSummaries } from "./services/tracker";
import { parseDrinkLimit, parseDrinkLogPatch, parseFoodLibraryItem, parseFoodLogPatch, parseInboxStatus, parseNewDrinkLog, parseNewFoodLog, parseNewInbox, parseNewTracker, parseNewTrackerEntry, ValidationError } from "./validation.ts";

type ToolResult = { result: string; summary: string; wrote: boolean };

function argsObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("工具参数格式不正确");
  return value as Record<string, unknown>;
}

function positiveId(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new ValidationError("ID 格式不正确"); return value as number; }

export async function executeAiTool(name: string, value: unknown, allowWrite: boolean): Promise<ToolResult> {
  const args = argsObject(value);
  if (name === "list_inbox") { const items=(await listInbox(parseInboxStatus(args.status))).slice(0,100);return{result:JSON.stringify({count:items.length,items}),summary:`读取了 ${items.length} 条 Inbox`,wrote:false}; }
  if (name === "get_timeline") { const limit=typeof args.limit==="number"?Math.max(1,Math.min(100,Math.trunc(args.limit))):50;const events=await listTimeline({date:typeof args.date==="string"?args.date:undefined,limit});return{result:JSON.stringify({count:events.length,events}),summary:`读取了 ${events.length} 条生活记录`,wrote:false}; }
  if(name==="list_trackers"){const trackers=await listTrackerSummaries();return{result:JSON.stringify({count:trackers.length,trackers}),summary:`读取了 ${trackers.length} 个 Tracker`,wrote:false};}
  if(name==="get_tracker_entries"){const detail=await getTrackerDetail(positiveId(args.trackerId),typeof args.query==="string"?args.query:"");return{result:JSON.stringify(detail??{error:"Tracker 不存在"}),summary:detail?`读取了「${detail.tracker.name}」的记录`:"未找到 Tracker",wrote:false};}
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
  if(name==="create_inbox"){const item=await createInbox(parseNewInbox({...args,source:typeof args.source==="string"?args.source:"eva"}));return{result:JSON.stringify({success:true,item}),summary:"已放进 Inbox",wrote:true};}
  if(name==="create_tracker"){const tracker=await createTracker(parseNewTracker(args));return{result:JSON.stringify({success:true,tracker}),summary:`已创建 Tracker「${tracker.name}」`,wrote:true};}
  if(name==="create_tracker_entry"){const entry=await createTrackerEntry(parseNewTrackerEntry(args));return{result:JSON.stringify({success:true,entry}),summary:"已记录一次 Tracker 事件",wrote:true};}
  if(name==="create_food_log"){const log=await createFoodLog(parseNewFoodLog(args));return{result:JSON.stringify({success:true,log}),summary:`已记录${log.title}`,wrote:true};}
  if(name==="update_food_log"){const id=positiveId(args.id);const patch={...args};delete patch.id;const log=await updateFoodLog(id,parseFoodLogPatch(patch));return{result:JSON.stringify(log?{success:true,log}:{error:"饮食记录不存在"}),summary:log?`已修正${log.title}`:"未找到饮食记录",wrote:Boolean(log)};}
  if(name==="upsert_food_library_item"){const item=await upsertFoodLibraryItem(parseFoodLibraryItem(args));return{result:JSON.stringify({success:true,item}),summary:`Food Library 已保存「${item.name}」`,wrote:true};}
  if(name==="create_drink_log"){const result=await createDrinkLog(parseNewDrinkLog(args));return{result:JSON.stringify({success:true,...result}),summary:`已记录${result.drink.name}`,wrote:true};}
  if(name==="update_drink_log"){const id=positiveId(args.id);const patch={...args};delete patch.id;const result=await updateDrinkLog(id,parseDrinkLogPatch(patch));return{result:JSON.stringify(result?{success:true,...result}:{error:"饮品记录不存在"}),summary:result?`已修正${result.drink.name}`:"未找到饮品记录",wrote:Boolean(result)};}
  if(name==="create_drink_limit"){const limit=await createDrinkLimit(parseDrinkLimit(args));return{result:JSON.stringify({success:true,limit}),summary:`已设置「${limit.name}」`,wrote:true};}
  return { result: JSON.stringify({ error: `不支持的工具：${name}` }), summary: `无法调用工具 ${name}`, wrote: false };
}
