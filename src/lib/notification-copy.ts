type ReminderNotificationCopyInput = {
  title: string;
  sourceType?: string | null;
  intervalValue?: number | null;
  nextDueAt?: string | null;
  timezone?: string | null;
};
import { reminderSourceDefinition } from "./reminder-source-registry.ts";

function dueDateTime(value: string, locale: string, timezone?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return date.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

export function reminderNotificationCopy(item: ReminderNotificationCopyInput, locale = "zh-CN") {
  const english = locale.toLocaleLowerCase().startsWith("en");
  const source = reminderSourceDefinition(item.sourceType);
  if (source.domainRule === "period_medication") {
    return {
      title: item.title,
      body: english
        ? "Based on your settings, if you still need it, you can consider or log another use."
        : "根据你的设置，如仍有需要，可以考虑或记录下一次使用。",
    };
  }
  if (source.domainRule === "tracker_missing") {
    const days = Math.max(1, item.intervalValue ?? 1);
    return {
      title: item.title,
      body: english ? `No record for ${days} day${days === 1 ? "" : "s"}` : `已 ${days} 日未记录`,
    };
  }
  const due = item.nextDueAt ? dueDateTime(item.nextDueAt, locale, item.timezone) : "";
  return {
    title: item.title,
    body: english ? `Due: ${due}` : `到期：${due}`,
  };
}
