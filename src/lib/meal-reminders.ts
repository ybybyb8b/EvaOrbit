import type { MealReminderRule, MealReminderType } from "./types";
import { dateRange } from "./time.ts";

export const MEAL_REMINDER_TYPES = ["breakfast", "lunch", "dinner"] as const satisfies readonly MealReminderType[];

export const DEFAULT_MEAL_REMINDER_TIMES: Record<MealReminderType, string> = {
  breakfast: "10:00",
  lunch: "14:00",
  dinner: "20:00",
};

export const MEAL_REMINDER_TARGET_IDS: Record<MealReminderType, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 3,
};

export function isMealReminderType(value: unknown): value is MealReminderType {
  return MEAL_REMINDER_TYPES.includes(value as MealReminderType);
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function mealReminderWindow(rule: Pick<MealReminderRule, "remindAt" | "enabled">, date: string, now = new Date()) {
  if (!rule.enabled || !isReminderTime(rule.remindAt)) return null;
  const [hour, minute] = rule.remindAt.split(":").map(Number);
  const range = dateRange(date);
  const scheduledAt = new Date(new Date(range.from).getTime() + (hour * 60 + minute) * 60_000);
  const elapsed = now.getTime() - scheduledAt.getTime();
  if (elapsed < 0 || elapsed >= 2 * 60 * 60_000) return null;
  return { scheduledAt: scheduledAt.toISOString(), from: range.from, to: range.to };
}
