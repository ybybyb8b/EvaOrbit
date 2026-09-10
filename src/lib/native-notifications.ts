import type { FoodLog, MealReminderRule, NativeNotificationSchedule, ScheduledNotification, WeightRecord, WeightSettings } from "./types";
import { notificationSendAt } from "./reminder-engine.ts";
import { reminderNotificationCopy } from "./notification-copy.ts";
import { dateInEvaOrbit, shiftDate, zonedDateParts, zonedDateTimeToUtc } from "./time.ts";
import { weightReminderSchedules } from "./weight.ts";

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

export function nativeReminderNotifications(item: ScheduledNotification, locale = "zh-CN", now = new Date(), days = 7): NativeNotificationSchedule[] {
  if (!item.isActive || !item.dueHasExplicitTime) return [];
  const copy = reminderNotificationCopy(item, locale);
  const initial = nativeReminderNotification(item, locale, now);
  const dueAt = item.snoozedUntil ?? item.nextDueAt;
  if (!dueAt) return initial ? [initial] : [];
  const due = zonedDateParts(dueAt, item.timezone);
  const today = zonedDateParts(now, item.timezone).date;
  const followUps = item.repeatWhileOverdue ? Array.from({ length: days }, (_, offset) => shiftDate(today, offset)).flatMap((date) => {
    if (date <= due.date) return [];
    const triggerAt = zonedDateTimeToUtc(date, due.time, item.timezone);
    if (new Date(triggerAt).getTime() <= now.getTime()) return [];
    return [{
      id: nativeNotificationIdentifier("reminder", `${item.id}-${date}`),
      title: copy.title,
      body: copy.body.slice(0, 1_000),
      triggerAt,
    }];
  }) : [];
  return initial ? [initial, ...followUps] : followUps;
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

export function nativeWeightNotifications(settings:WeightSettings,records:Pick<WeightRecord,"occurredAt">[],locale="zh-CN",now=new Date(),days=7):NativeNotificationSchedule[]{const english=locale.toLowerCase().startsWith("en");return weightReminderSchedules(settings,records,now,days).map(item=>({id:nativeNotificationIdentifier("weight",item.date),title:english?"Log today’s weight":"记录今天的体重",body:english?"No weight has been recorded today.":"今天还没有体重记录。",triggerAt:item.triggerAt}));}

export function buildNativeNotificationSchedules(input: {
  upcoming: ScheduledNotification[];
  mealRules: MealReminderRule[];
  foodLogs: Pick<FoodLog, "occurredAt" | "mealType">[];
  weightSettings?: WeightSettings;
  weightRecords?: Pick<WeightRecord,"occurredAt">[];
  locale?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return [
    ...input.upcoming.flatMap((item) => nativeReminderNotifications(item, input.locale, now)),
    ...nativeMealNotifications(input.mealRules, input.foodLogs, input.locale, now),
    ...(input.weightSettings ? nativeWeightNotifications(input.weightSettings,input.weightRecords??[],input.locale,now) : []),
  ].sort((a, b) => a.triggerAt.localeCompare(b.triggerAt));
}
