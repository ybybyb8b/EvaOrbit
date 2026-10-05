export type TrackerTimeRange = { startAt: string; endAt: string; durationMinutes: number };

/** Duration is derived from explicit instants; an overnight stay uses different dates. */
export function normalizeTrackerTimeRange(value: unknown): TrackerTimeRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请填写开始和结束时间");
  const range = value as Record<string, unknown>;
  function instant(value: unknown) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value.slice(0, 10) + "T12:00:00Z").toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error("请填写有效的开始和结束时间");
    return new Date(value).toISOString();
  }
  const startAt = instant(range.startAt), endAt = instant(range.endAt);
  const durationMinutes = (Date.parse(endAt) - Date.parse(startAt)) / 60000;
  if (durationMinutes <= 0) throw new Error("结束时间必须晚于开始时间");
  return { startAt, endAt, durationMinutes };
}

export function trackerDurationMinutes(value: unknown): number | null {
  try { return normalizeTrackerTimeRange(value).durationMinutes; } catch { return null; }
}

export function formatTrackerTimeRange(value: unknown, english = false): string {
  try {
    const range = normalizeTrackerTimeRange(value);
    const formatter = new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return `${formatter.format(new Date(range.startAt))} – ${formatter.format(new Date(range.endAt))} · ${Number(range.durationMinutes.toFixed(2))} ${english ? "min" : "分钟"}`;
  } catch { return ""; }
}
