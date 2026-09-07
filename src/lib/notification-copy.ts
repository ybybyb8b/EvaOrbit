type ReminderNotificationCopyInput = {
  title: string;
  sourceType?: string | null;
  intervalValue?: number | null;
  nextDueAt?: string | null;
  timezone?: string | null;
};

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
  if (item.sourceType === "tracker_missing") {
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
