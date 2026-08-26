import { dateInEvaOrbit, EVAORBIT_TIME_ZONE } from "./time.ts";
import type { TrackerChoiceInsight, TrackerDistributionItem, TrackerEntry, TrackerField, TrackerInsights, TrackerNumericInsight } from "./types.ts";

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthKeys(today: string) {
  const anchor = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
  return Array.from({ length: 12 }, (_, index) => {
    const value = new Date(anchor);
    value.setUTCMonth(value.getUTCMonth() - 11 + index);
    return value.toISOString().slice(0, 7);
  });
}

function distribution(keys: Array<{ key: string; label: string }>, values: string[]): TrackerDistributionItem[] {
  const total = values.length;
  return keys.map((item) => {
    const count = values.filter((value) => value === item.key).length;
    return { ...item, count, percentage: total ? Math.round(count / total * 100) : 0 };
  });
}

function fieldValue(entry: TrackerEntry, field: TrackerField) {
  return entry.values[field.key] ?? entry.values[String(field.id)];
}

function localHour(value: string) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: EVAORBIT_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).find((item) => item.type === "hour");
  return Number(part?.value ?? 0);
}

function dayPart(hour: number) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function numericInsights(entries: TrackerEntry[], fields: TrackerField[]): TrackerNumericInsight[] {
  return fields.filter((field) => field.includeInStats && (field.type === "number" || field.type === "rating")).flatMap((field) => {
    const values = entries.map((entry) => fieldValue(entry, field)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return [];
    const rounded = (value: number) => Number(value.toFixed(field.precision));
    return [{ fieldKey: field.key, name: field.name, unit: field.unit, count: values.length, average: rounded(values.reduce((sum, value) => sum + value, 0) / values.length), minimum: Math.min(...values), maximum: Math.max(...values), latest: values[0] }];
  });
}

function choiceInsights(entries: TrackerEntry[], fields: TrackerField[]): TrackerChoiceInsight[] {
  return fields.filter((field) => field.includeInStats && ["single_select", "multi_select", "boolean"].includes(field.type)).flatMap((field) => {
    const values = entries.flatMap((entry) => {
      const value = fieldValue(entry, field);
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === "boolean") return [value ? "true" : "false"];
      return typeof value === "string" && value ? [value] : [];
    });
    if (!values.length) return [];
    const options = field.type === "boolean" ? [{ key: "true", label: "Yes" }, { key: "false", label: "No" }] : [...new Set([...field.options, ...values])].map((value) => ({ key: value, label: value }));
    return [{ fieldKey: field.key, name: field.name, values: distribution(options, values).sort((a, b) => b.count - a.count) }];
  });
}

export function buildTrackerInsights(entries: TrackerEntry[], fields: TrackerField[], now = new Date()): TrackerInsights {
  const today = dateInEvaOrbit(now);
  const dates = Array.from({ length: 365 }, (_, index) => shiftDate(today, index - 364));
  const entryDates = entries.map((entry) => dateInEvaOrbit(new Date(entry.occurredAt)));
  const counts = new Map<string, number>();
  entryDates.forEach((date) => counts.set(date, (counts.get(date) ?? 0) + 1));
  const months = monthKeys(today);
  const weekdayKeys = [
    { key: "1", label: "Mon" }, { key: "2", label: "Tue" }, { key: "3", label: "Wed" }, { key: "4", label: "Thu" }, { key: "5", label: "Fri" }, { key: "6", label: "Sat" }, { key: "0", label: "Sun" },
  ];
  const weekdayValues = entryDates.map((date) => String(new Date(`${date}T12:00:00Z`).getUTCDay()));
  const dayPartKeys = [{ key: "morning", label: "Morning" }, { key: "afternoon", label: "Afternoon" }, { key: "evening", label: "Evening" }, { key: "night", label: "Night" }];
  return {
    heatmap: dates.map((date) => ({ date, count: counts.get(date) ?? 0 })),
    monthly: distribution(months.map((key) => ({ key, label: new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) })), entryDates.map((date) => date.slice(0, 7))),
    weekdays: distribution(weekdayKeys, weekdayValues),
    dayParts: distribution(dayPartKeys, entries.map((entry) => dayPart(localHour(entry.occurredAt)))),
    activeDays: counts.size,
    numericFields: numericInsights(entries, fields),
    choiceFields: choiceInsights(entries, fields),
  };
}
