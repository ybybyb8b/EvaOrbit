import type { NativeNotificationSchedule, ScheduledNotification } from "./types";
import { notificationSendAt } from "./reminder-engine.ts";
import { reminderNotificationCopy } from "./notification-copy.ts";
import { shiftDate, zonedDateParts, zonedDateTimeToUtc } from "./time.ts";
import { reminderSourceAllows } from "./reminder-source-registry.ts";

export const MANAGED_NATIVE_NOTIFICATION_PREFIX = "evaorbit-scheduled-";

export function nativeNotificationIdentifier(source: string, id: string | number) {
  return `${MANAGED_NATIVE_NOTIFICATION_PREFIX}${source}-${id}`;
}

export function isManagedNativeNotification(id: string) {
  return id.startsWith(MANAGED_NATIVE_NOTIFICATION_PREFIX) || id.startsWith("evaorbit-reminder-");
}

export function nativeReminderNotification(item: ScheduledNotification, locale = "zh-CN", now = new Date()): NativeNotificationSchedule | null {
  const triggerAt = notificationSendAt(item);
  if (!item.isActive || !reminderSourceAllows(item.sourceType, "native_local") || !triggerAt || new Date(triggerAt).getTime() <= now.getTime()) return null;
  const copy = reminderNotificationCopy(item, locale);
  return { id: nativeNotificationIdentifier("reminder", item.id), title: copy.title, body: copy.body.slice(0, 1_000), triggerAt };
}

export function nativeReminderNotifications(item: ScheduledNotification, locale = "zh-CN", now = new Date(), days = 7): NativeNotificationSchedule[] {
  if (!item.isActive || !item.dueHasExplicitTime || !reminderSourceAllows(item.sourceType, "native_local")) return [];
  const copy = reminderNotificationCopy(item, locale);
  const initial = nativeReminderNotification(item, locale, now);
  if (!item.nextDueAt) return initial ? [initial] : [];
  const reminderTime = zonedDateParts(item.nextDueAt, item.timezone).time;
  const overdueBoundary=item.overdueAfter===undefined?item.nextDueAt:item.overdueAfter;
  if(!overdueBoundary)return initial?[initial]:[];
  const overdueDate=zonedDateParts(overdueBoundary,item.timezone).date;
  const today = zonedDateParts(now, item.timezone).date;
  const followUps = item.repeatWhileOverdue ? Array.from({ length: days }, (_, offset) => shiftDate(today, offset)).flatMap((date) => {
    if (date <= overdueDate) return [];
    const triggerAt = zonedDateTimeToUtc(date, reminderTime, item.timezone);
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

export function buildNativeNotificationSchedules(input: {
  upcoming: ScheduledNotification[];
  locale?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return [
    ...input.upcoming.flatMap((item) => nativeReminderNotifications(item, input.locale, now)),
  ].sort((a, b) => a.triggerAt.localeCompare(b.triggerAt));
}
