import "server-only";

import { DEFAULT_MEAL_REMINDER_TIMES, isMealReminderType, isReminderTime, MEAL_REMINDER_TYPES } from "../meal-reminders";
import { getRepository } from "../repositories";
import type { MealReminderRule } from "../types";
import { ValidationError } from "../validation";

function ordered(rules: MealReminderRule[]) {
  return [...rules].sort((a, b) => MEAL_REMINDER_TYPES.indexOf(a.mealType) - MEAL_REMINDER_TYPES.indexOf(b.mealType));
}

export async function listMealReminderRules() {
  const repository = await getRepository();
  const existing = await repository.listMealReminderRules();
  const present = new Set(existing.map((rule) => rule.mealType));
  const missing = MEAL_REMINDER_TYPES.filter((mealType) => !present.has(mealType));
  if (!missing.length) return ordered(existing);
  return ordered(await repository.updateMealReminderRules([
    ...existing.map(({ mealType, remindAt, enabled }) => ({ mealType, remindAt, enabled })),
    ...missing.map((mealType) => ({ mealType, remindAt: DEFAULT_MEAL_REMINDER_TIMES[mealType], enabled: true })),
  ]));
}

export async function updateMealReminderRules(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) throw new ValidationError("三餐提醒规则不正确");
  const seen = new Set<string>();
  const rules: Array<Pick<MealReminderRule, "mealType" | "remindAt" | "enabled">> = value.map((item) => {
    if (!item || typeof item !== "object") throw new ValidationError("三餐提醒规则不正确");
    const rule = item as Record<string, unknown>;
    if (!isMealReminderType(rule.mealType) || seen.has(rule.mealType)) throw new ValidationError("餐次不正确");
    if (!isReminderTime(rule.remindAt)) throw new ValidationError("提醒时间不正确");
    if (typeof rule.enabled !== "boolean") throw new ValidationError("提醒状态不正确");
    seen.add(rule.mealType);
    return { mealType: rule.mealType, remindAt: rule.remindAt, enabled: rule.enabled };
  });
  return ordered(await (await getRepository()).updateMealReminderRules(rules));
}
