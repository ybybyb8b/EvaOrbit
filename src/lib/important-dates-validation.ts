import { parseImportantDateBackground } from "./important-date-background.ts";
import { ValidationError } from "./validation.ts";
import type { ImportantDate, ImportantDateInput } from "./important-dates.ts";
import { lunarToSolar, solarToLunar, type LunarDate } from "./lunar-calendar.ts";

export const importantDateInputFields = ["title", "date", "calendar", "lunar", "lunarLeapPolicy", "recurrence", "category", "categoryColor", "note", "pinned", "archived", "reminderTime", "reminderDaysBefore", "background", "countMode", "displayMode"] as const;

export function parseImportantDate(value: unknown): ImportantDateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("重要日子格式不正确");
  const body = value as Record<string, unknown>;
  const allowed:readonly string[] = importantDateInputFields;
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ValidationError("包含未知的重要日子字段");
  function text(key: string, max: number, fallback = "") {
    const value = body[key] ?? fallback;
    if (typeof value !== "string" || value.trim().length > max) throw new ValidationError(`${key} 格式或长度不正确`);
    return value.trim();
  }
  const title = text("title", 120);
  let date = text("date",10);
  if(body.calendar!==undefined&&body.calendar!=="solar"&&body.calendar!=="lunar")throw new ValidationError("请选择公历或农历");
  const lunarLeapPolicy=body.lunarLeapPolicy??"regular";
  if(lunarLeapPolicy!=="regular"&&lunarLeapPolicy!=="skip")throw new ValidationError("闰月重复规则不正确");
  let lunar:LunarDate|null=null;
  if(body.calendar==="lunar"){
    const raw=body.lunar;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new ValidationError("请填写农历日期");
    const value=raw as Record<string,unknown>;
    if(Object.keys(value).some(key=>!["year","month","day","leap"].includes(key))||![value.year,value.month,value.day].every(part=>typeof part==="number"&&Number.isInteger(part))||typeof value.leap!=="boolean")throw new ValidationError("农历日期格式不正确");
    lunar={year:Number(value.year),month:Number(value.month),day:Number(value.day),leap:value.leap};
    const solar=lunarToSolar(lunar);
    if(!solar)throw new ValidationError("请选择有效的农历日期（1901—2100 年），注意闰月和大小月");
    if(date&&date!==solar)throw new ValidationError("农历与公历日期不一致，请重新选择日期");
    date=solar;
  }else if(body.lunar!=null)throw new ValidationError("农历日期须选择农历模式");
  if (!title) throw new ValidationError("请填写日子名称");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "0100-01-01" || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new ValidationError("请填写有效日期（0100—9999 年）");
  const recurrence = body.recurrence ?? "none";
  if (!["none","weekly","monthly","yearly"].includes(String(recurrence))) throw new ValidationError("重复规则不正确");
  for (const key of ["pinned", "archived"]) if (body[key] !== undefined && typeof body[key] !== "boolean") throw new ValidationError(`${key} 必须为布尔值`);
  const reminderTime = body.reminderTime === null || body.reminderTime === undefined || body.reminderTime === "" ? null : text("reminderTime", 5);
  if (reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) throw new ValidationError("请选择有效的提醒时间");
  const reminderDaysBefore = body.reminderDaysBefore ?? 0;
  if (typeof reminderDaysBefore !== "number" || !Number.isSafeInteger(reminderDaysBefore) || reminderDaysBefore < 0 || reminderDaysBefore > 366) throw new ValidationError("提前天数须为 0—366 的整数");
  const maxLead=recurrence==="weekly"?6:recurrence==="monthly"?27:366;
  if(reminderTime&&reminderDaysBefore>maxLead)throw new ValidationError(`此重复规则的提醒最多提前 ${maxLead} 天，避免跨越下一周期`);
  if(body.displayMode!==undefined&&!["auto","elapsed","countdown"].includes(String(body.displayMode)))throw new ValidationError("展示方式不正确");
  const category = text("category", 40);
  const color = body.categoryColor;
  if (color !== undefined && color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))) throw new ValidationError("请选择有效的分类颜色");
  if (color && !category) throw new ValidationError("请先填写分类名称");
  if(body.countMode!==undefined&&body.countMode!=="elapsed"&&body.countMode!=="ordinal")throw new ValidationError("计数方式不正确");
  const background=parseImportantDateBackground(body.background);
  return { ...(body.displayMode!==undefined?{displayMode:body.displayMode as ImportantDateInput["displayMode"]}:{}), ...(body.countMode!==undefined?{countMode:body.countMode}:{}), ...(background!==undefined?{background}:{}), title, date, ...(body.calendar!==undefined?{calendar:body.calendar,lunar,lunarLeapPolicy}:{}), recurrence:recurrence as ImportantDateInput["recurrence"], category, ...(color !== undefined ? {categoryColor: color as string | null} : {}), note: text("note", 2000), pinned: body.pinned === true, archived: body.archived === true, reminderTime, reminderDaysBefore };
}

/** MCP PATCH preserves omitted event fields, but never replays a stale shared category color. */
export function parseImportantDatePatch(value:unknown,current:ImportantDate):ImportantDateInput {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new ValidationError("重要日子修改格式不正确");
  const patch=value as Record<string,unknown>;
  if(!Object.keys(patch).length)throw new ValidationError("请提供要修改的重要日子字段");
  if(Object.keys(patch).some(key=>!(importantDateInputFields as readonly string[]).includes(key)))throw new ValidationError("包含未知的重要日子字段");
  const original=Object.fromEntries(importantDateInputFields.filter(key=>key in current).map(key=>[key,current[key]]));
  const merged:Record<string,unknown>={...original,calendar:current.calendar??"solar",categoryColor:undefined,...patch};
  if(patch.calendar==="solar"){
    if(!Object.hasOwn(patch,"lunar"))merged.lunar=null;
    merged.lunarLeapPolicy="regular";
  }
  if(merged.calendar==="lunar"){
    if(Object.hasOwn(patch,"lunar")&&!Object.hasOwn(patch,"date"))merged.date=undefined;
    else if(patch.calendar==="lunar"&&!Object.hasOwn(patch,"lunar"))merged.lunar=solarToLunar(String(merged.date));
  }
  return parseImportantDate(merged);
}

export function parseImportantDateCategory(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new ValidationError("分类格式不正确");
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['name','color'].includes(key))||typeof data.name!=="string"||!data.name.trim()||data.name.trim().length>40)throw new ValidationError("请填写 1—40 字的分类名称");
  if(data.color!==null&&(typeof data.color!=="string"||!/^#[0-9a-f]{6}$/i.test(data.color)))throw new ValidationError("请选择有效的分类颜色");
  return {name:data.name.trim(),color:data.color as string|null};
}
