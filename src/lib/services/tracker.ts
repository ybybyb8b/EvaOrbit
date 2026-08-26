import "server-only";

import { getRepository } from "../repositories";
import type { NewTracker, NewTrackerEntry, NewTrackerField, NewTrackerGoal, NewTrackerReminder } from "../repositories/types";
import { dateInEvaOrbit, dateRange, weekRange } from "../time";
import type { DrinkLog, Tracker, TrackerEntry, TrackerField, TrackerReminder, TrackerStats, TrackerSummary } from "../types";
import { ConflictError } from "../errors";
import { ValidationError } from "../validation";
import { buildTrackerInsights } from "../tracker-insights";
import { resetTrackerIcon } from "./tracker-icon";

function linkedDrinkType(tracker: Tracker) {
  return tracker.dataSourceType === "linked_source" && tracker.sourceConfig.module === "drink" && typeof tracker.sourceConfig.drinkType === "string" ? tracker.sourceConfig.drinkType : null;
}

function drinkEntry(trackerId: number, drink: DrinkLog): TrackerEntry {
  return {
    id: drink.id, trackerId, occurredAt: drink.occurredAt, endAt: null,
    values: { drinkType: drink.drinkType, brand: drink.brand, volumeMl: drink.volumeMl, sugarLevel: drink.sugarLevel },
    note: drink.notes || [drink.brand, drink.volumeMl ? `${drink.volumeMl} ml` : ""].filter(Boolean).join(" · "),
    sourceType: "drink", createdAt: drink.createdAt, updatedAt: drink.updatedAt,
  };
}

function stats(entries: TrackerEntry[], reminders: TrackerReminder[], now = new Date()): TrackerStats {
  const today = dateInEvaOrbit(now);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const week = weekRange(now);
  const lastOccurredAt = entries[0]?.occurredAt ?? null;
  const reminderDue = reminders.some((reminder) => {
    if (!reminder.enabled || reminder.reminderType !== "interval" || !reminder.intervalDays) return false;
    if (!lastOccurredAt) return true;
    return now.getTime() - new Date(lastOccurredAt).getTime() >= reminder.intervalDays * 86400000;
  });
  return {
    today: entries.filter((entry) => dateInEvaOrbit(new Date(entry.occurredAt)) === today).length,
    week: entries.filter((entry) => entry.occurredAt >= week.from && entry.occurredAt < week.to).length,
    month: entries.filter((entry) => dateInEvaOrbit(new Date(entry.occurredAt)).startsWith(month)).length,
    year: entries.filter((entry) => dateInEvaOrbit(new Date(entry.occurredAt)).startsWith(year)).length,
    total: entries.length, lastOccurredAt, reminderDue,
  };
}

async function entriesFor(tracker: Tracker, input: { from?: string; to?: string; query?: string } = {}) {
  const repository = await getRepository();
  const drinkType = linkedDrinkType(tracker);
  if (drinkType) {
    const drinks = await repository.listDrinkLogs({ from: input.from, to: input.to, drinkType });
    const entries = drinks.map((drink) => drinkEntry(tracker.id, drink));
    if (!input.query) return entries;
    const query = input.query.toLocaleLowerCase();
    return entries.filter((entry) => `${entry.note} ${JSON.stringify(entry.values)}`.toLocaleLowerCase().includes(query));
  }
  return repository.listTrackerEntries(tracker.id, input);
}

export async function listTrackerSummaries(): Promise<TrackerSummary[]> {
  const repository = await getRepository();
  const trackers = await repository.listTrackers();
  const [nativeEntries, reminders, drinks] = await Promise.all([
    repository.listTrackerEntries(undefined),
    Promise.all(trackers.map((tracker) => repository.listTrackerReminders(tracker.id))),
    trackers.some(linkedDrinkType) ? repository.listDrinkLogs() : Promise.resolve([]),
  ]);
  return trackers.map((tracker, index) => {
    const drinkType = linkedDrinkType(tracker);
    const entries = drinkType ? drinks.filter((drink) => drink.drinkType === drinkType).map((drink) => drinkEntry(tracker.id, drink)) : nativeEntries.filter((entry) => entry.trackerId === tracker.id);
    return { ...tracker, stats: stats(entries, reminders[index]) };
  });
}

export async function getTrackerDetail(id: number, query = "") {
  const repository = await getRepository();
  const tracker = await repository.getTracker(id);
  if (!tracker) return null;
  const [fields, goals, reminders, allEntries] = await Promise.all([
    repository.listTrackerFields(id), repository.listTrackerGoals(id), repository.listTrackerReminders(id), entriesFor(tracker),
  ]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const entries = normalizedQuery ? allEntries.filter((entry) => `${entry.note} ${JSON.stringify(entry.values)}`.toLocaleLowerCase().includes(normalizedQuery)) : allEntries;
  return { tracker, fields, goals, reminders, entries, stats: stats(allEntries, reminders), insights: buildTrackerInsights(allEntries, fields) };
}

export async function createTracker(input: NewTracker) { return (await getRepository()).createTracker(input); }
export async function updateTracker(id: number, input: Record<string, unknown>) { return (await getRepository()).updateTracker(id, input); }
export async function deleteTracker(id: number) {
  const repository = await getRepository();
  if (!await repository.getTracker(id)) return false;
  await resetTrackerIcon(id);
  return repository.deleteTracker(id);
}
export async function createTrackerField(input: NewTrackerField) {
  const tracker = await (await getRepository()).getTracker(input.trackerId);
  if (!tracker) throw new ValidationError("Tracker 不存在");
  if (tracker.dataSourceType === "linked_source") throw new ConflictError("联动 Tracker 的字段来自原始模块，不能在这里重复定义");
  return (await getRepository()).createTrackerField(input);
}
export async function deleteTrackerField(id: number) { return (await getRepository()).deleteTrackerField(id); }

function validatedValues(fields: TrackerField[], values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  const quickCapture = Object.keys(values).length === 0;
  for (const field of fields.filter((item) => !item.archivedAt)) {
    const value = values[field.key] ?? values[String(field.id)] ?? field.defaultValue;
    if (!quickCapture && field.required && (value === undefined || value === null || value === "" || Array.isArray(value) && !value.length)) throw new ValidationError(`${field.name}不能为空`);
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new ValidationError(`${field.name}必须是数字`);
    if (field.type === "boolean" && typeof value !== "boolean") throw new ValidationError(`${field.name}必须是开关值`);
    if (field.type === "rating" && (typeof value !== "number" || value < 1 || value > 5)) throw new ValidationError(`${field.name}评分必须在 1–5 之间`);
    if (field.type === "single_select" && (typeof value !== "string" || !field.options.includes(value))) throw new ValidationError(`${field.name}选项不正确`);
    if (field.type === "multi_select" && (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !field.options.includes(item)))) throw new ValidationError(`${field.name}选项不正确`);
    if (field.type === "text" && typeof value !== "string") throw new ValidationError(`${field.name}必须是文字`);
    result[field.key] = value;
  }
  return result;
}

export async function createTrackerEntry(input: NewTrackerEntry) {
  const repository = await getRepository();
  const tracker = await repository.getTracker(input.trackerId);
  if (!tracker) throw new ValidationError("Tracker 不存在");
  if (tracker.dataSourceType === "linked_source") throw new ConflictError("这是联动 Tracker，请从原始 Drink 记录新增数据");
  const fields = await repository.listTrackerFields(tracker.id);
  return repository.createTrackerEntry({ ...input, values: validatedValues(fields, input.values) });
}
export async function updateTrackerEntry(id: number, input: Record<string, unknown>) { return (await getRepository()).updateTrackerEntry(id, input); }
export async function deleteTrackerEntry(id: number) { return (await getRepository()).deleteTrackerEntry(id); }
export async function createTrackerGoal(input: NewTrackerGoal) { return (await getRepository()).createTrackerGoal(input); }
export async function deleteTrackerGoal(id: number) { return (await getRepository()).deleteTrackerGoal(id); }
export async function createTrackerReminder(input: NewTrackerReminder) { return (await getRepository()).createTrackerReminder(input); }
export async function deleteTrackerReminder(id: number) { return (await getRepository()).deleteTrackerReminder(id); }

export async function getTodayNativeTrackerEntries() {
  const repository = await getRepository();
  const range = dateRange(dateInEvaOrbit());
  return repository.listTrackerEntries(undefined, range);
}
