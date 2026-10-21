import { normalizeTrackerTimeRange } from "./tracker-time-range.ts";
import { ValidationError } from "./validation.ts";
import type { TrackerField } from "./types";

export function validatedTrackerValues(fields: TrackerField[], values: Record<string, unknown>, quickCaptureEnabled: boolean, preserveArchived = false) {
  const result: Record<string, unknown> = {};
  if (preserveArchived) for (const field of fields.filter(item => item.archivedAt)) {
    const key = Object.hasOwn(values, field.key) ? field.key : String(field.id);
    if (Object.hasOwn(values, key)) result[field.key] = values[key];
  }
  const quickCapture = quickCaptureEnabled && Object.keys(values).length === 0;
  for (const field of fields.filter(item => !item.archivedAt)) {
    const value = values[field.key] ?? values[String(field.id)] ?? field.defaultValue;
    if (!quickCapture && field.required && (value === undefined || value === null || value === "" || Array.isArray(value) && !value.length)) throw new ValidationError(`${field.name}不能为空`);
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new ValidationError(`${field.name}必须是数字`);
    if (field.type === "boolean" && typeof value !== "boolean") throw new ValidationError(`${field.name}必须是开关值`);
    if (field.type === "rating" && (typeof value !== "number" || value < 1 || value > 5)) throw new ValidationError(`${field.name}评分必须在 1–5 之间`);
    if (field.type === "single_select" && (typeof value !== "string" || !field.options.includes(value))) throw new ValidationError(`${field.name}选项不正确`);
    if (field.type === "multi_select" && (!Array.isArray(value) || value.some(item => typeof item !== "string" || !field.options.includes(item)))) throw new ValidationError(`${field.name}选项不正确`);
    if (field.type === "text" && typeof value !== "string") throw new ValidationError(`${field.name}必须是文字`);
    if (field.type === "time_range") {
      try { result[field.key] = normalizeTrackerTimeRange(value); }
      catch (error) { throw new ValidationError(field.name + "：" + (error instanceof Error ? error.message : "时间段格式不正确")); }
    } else result[field.key] = value;
  }
  return result;
}
