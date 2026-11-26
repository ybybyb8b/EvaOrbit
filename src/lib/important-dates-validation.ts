import { ValidationError } from "./validation.ts";
import type { ImportantDateInput } from "./important-dates.ts";

export function parseImportantDate(value: unknown): ImportantDateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("重要日子格式不正确");
  const body = value as Record<string, unknown>;
  const allowed = ["title", "date", "recurrence", "category", "categoryColor", "note", "pinned", "archived", "reminderTime", "reminderDaysBefore"];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ValidationError("包含未知的重要日子字段");
  function text(key: string, max: number, fallback = "") {
    const value = body[key] ?? fallback;
    if (typeof value !== "string" || value.trim().length > max) throw new ValidationError(`${key} 格式或长度不正确`);
    return value.trim();
  }
  const title = text("title", 120), date = text("date", 10);
  if (!title) throw new ValidationError("请填写日子名称");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "0100-01-01" || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new ValidationError("请填写有效日期（0100—9999 年）");
  const recurrence = body.recurrence ?? "none";
  if (recurrence !== "none" && recurrence !== "yearly") throw new ValidationError("重复规则不正确");
  for (const key of ["pinned", "archived"]) if (body[key] !== undefined && typeof body[key] !== "boolean") throw new ValidationError(`${key} 必须为布尔值`);
  const reminderTime = body.reminderTime === null || body.reminderTime === undefined || body.reminderTime === "" ? null : text("reminderTime", 5);
  if (reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) throw new ValidationError("请选择有效的提醒时间");
  const reminderDaysBefore = body.reminderDaysBefore ?? 0;
  if (typeof reminderDaysBefore !== "number" || !Number.isSafeInteger(reminderDaysBefore) || reminderDaysBefore < 0 || reminderDaysBefore > 366) throw new ValidationError("提前天数须为 0—366 的整数");
  const category = text("category", 40);
  const color = body.categoryColor;
  if (color !== undefined && color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))) throw new ValidationError("请选择有效的分类颜色");
  if (color && !category) throw new ValidationError("请先填写分类名称");
  return { title, date, recurrence, category, ...(color !== undefined ? {categoryColor: color as string | null} : {}), note: text("note", 2000), pinned: body.pinned === true, archived: body.archived === true, reminderTime, reminderDaysBefore };
}
