import type { FoodLog, MealReminderRule, NativeNotificationSchedule, ScheduledNotification } from "./types";
import { notificationSendAt } from "./reminder-engine.ts";
import { reminderNotificationCopy } from "./notification-copy.ts";
import { dateInEvaOrbit, shiftDate, zonedDateParts, zonedDateTimeToUtc } from "./time.ts";

const managedPrefix = "evaorbit-scheduled-";

export function nativeNotificationIdentifier(source: string, id: string | number) {
  return `${managedPrefix}${source}-${id}`;
}

export function isManagedNativeNotification(id: string) {
  return id.startsWith(managedPrefix) || id.startsWith("evaorbit-reminder-");
}

export function nativeReminderNotification(item: ScheduledNotification, locale = "zh-CN", now = new Date()): NativeNotificationSchedule | null {
  const triggerAt = notificationSendAt(item);
  if (!item.isActive || !triggerAt || new Date(triggerAt).getTime() <= now.getTime()) return null;
  const copy = reminderNotificationCopy(item, locale);
  return { id: nativeNotificationIdentifier("reminder", item.id), title: copy.title, body: copy.body.slice(0, 1_000), triggerAt };
}

export function nativeMealNotifications(
  rules: MealReminderRule[],
  logs: Pick<FoodLog, "occurredAt" | "mealType">[],
  locale = "zh-CN",
  now = new Date(),
  days = 7,
): NativeNotificationSchedule[] {
  const english = locale.toLowerCase().startsWith("en");
  const labels = { breakfast: { zh: "早餐", en: "breakfast" }, lunch: { zh: "午餐", en: "lunch" }, dinner: { zh: "晚餐", en: "dinner" } } as const;
  const logged = new Set(logs.map((log) => `${zonedDateParts(log.occurredAt).date}:${log.mealType}`));
  const start = dateInEvaOrbit(now);
  return rules.flatMap((rule) => {
    if (!rule.enabled) return [];
    return Array.from({ length: days }, (_, offset) => shiftDate(start, offset)).flatMap((date) => {
      const triggerAt = zonedDateTimeToUtc(date, rule.remindAt);
      if (new Date(triggerAt).getTime() <= now.getTime() || logged.has(`${date}:${rule.mealType}`)) return [];
      const meal = labels[rule.mealType];
      return [{
        id: nativeNotificationIdentifier("meal", `${rule.mealType}-${date}`),
        title: english ? `No ${meal.en} logged` : `还没记录${meal.zh}`,
        body: english ? `Today's ${meal.en} has not been recorded.` : `今天的${meal.zh}还没有记录。`,
        triggerAt,
      }];
    });
  });
}

export function buildNativeNotificationSchedules(input: {
  upcoming: ScheduledNotification[];
  mealRules: MealReminderRule[];
  foodLogs: Pick<FoodLog, "occurredAt" | "mealType">[];
  locale?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return [
    ...input.upcoming.map((item) => nativeReminderNotification(item, input.locale, now)).filter((item): item is NativeNotificationSchedule => item !== null),
    ...nativeMealNotifications(input.mealRules, input.foodLogs, input.locale, now),
  ].sort((a, b) => a.triggerAt.localeCompare(b.triggerAt));
}
