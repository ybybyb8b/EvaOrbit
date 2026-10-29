import type { HomeDayOverview } from "./home-day.ts";
import type { TimelineMonthSummary, DueReminder } from "./types.ts";

export type HomeResourceKind = "day" | "month" | "due";
export type HomeReadonlyResource = { format: "eo-home-readonly-v1"; accountId: string; kind: HomeResourceKind; key: string; capturedAt: string; data: HomeDayOverview | TimelineMonthSummary | DueReminder[]; icons?: Record<string,string> };
export function homeResourceKey(value: { kind: string; key: string }): { kind: HomeResourceKind; key: string } {
  const { kind, key } = value;
  const date = kind === "month" ? key + "-01" : key;
  if (kind === "due" && key === "current") return { kind, key };
  if ((kind !== "day" && kind !== "month") || !/^\d{4}-\d{2}-\d{2}$/.test(date) || kind === "month" && !/^\d{4}-\d{2}$/.test(key) || !Number.isFinite(Date.parse(date + "T12:00:00Z")) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("Invalid Home resource date");
  return { kind, key };
}
export function validateHomeResource(value: HomeReadonlyResource, accountId: string, kind: HomeResourceKind, key: string) {
  homeResourceKey({ kind, key });
  if (!value || value.format !== "eo-home-readonly-v1" || value.accountId !== accountId || value.kind !== kind || value.key !== key || !Number.isFinite(Date.parse(value.capturedAt))) throw new Error("Home snapshot does not match the account or date");
  const data = value.data as unknown as Record<string, unknown>;
  if (kind === "day" && (!data || data.date !== key || !["events", "tasks", "meals", "journal", "activities", "activityRecords"].every(name => Array.isArray(data[name])) || !data.calendarInterpretation)) throw new Error("Home day snapshot is incomplete");
  if (kind === "day" && data.completedItems !== undefined && (!Array.isArray(data.completedItems) || data.completedItems.some(item => !item || typeof item.key !== "string" || typeof item.title !== "string" || typeof item.href !== "string" || !item.href.startsWith("/") || item.href.startsWith("//") || !Number.isFinite(Date.parse(item.completedAt)) || typeof item.hasExplicitTime !== "boolean"))) throw new Error("Home completion snapshot is invalid");
  if (kind === "month" && (!data || data.month !== key || !data.days || typeof data.days !== "object" || Array.isArray(data.days) || !Array.isArray(data.periods))) throw new Error("Home month snapshot is incomplete");
  if (kind === "due" && !Array.isArray(value.data)) throw new Error("Home reminder snapshot is incomplete");
  if (value.icons && Object.entries(value.icons).some(([name,url]) => !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) || typeof url !== "string" || url.length > 100_000 || !/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(url))) throw new Error("Home icon cache is invalid");
  return value;
}
