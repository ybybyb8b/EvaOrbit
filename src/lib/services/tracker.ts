import "server-only";

import { getRepository } from "../repositories";
import type { NewTracker, NewTrackerEntry, NewTrackerField, NewTrackerGoal, NewTrackerReminder } from "../repositories/types";
import { dateInEvaOrbit, dateRange, weekRange } from "../time";
import type { Reminder, TrackerEntry, TrackerField, TrackerReminder, TrackerStats, TrackerSummary } from "../types";
import { ValidationError } from "../validation";
import { buildTrackerInsights } from "../tracker-insights";
import { nextTrackerNotification, trackerReminderShouldNotify } from "../reminder-engine";
import { resetTrackerIcon } from "./tracker-icon";

function stats(entries: TrackerEntry[], reminders: TrackerReminder[], now = new Date()): TrackerStats {
  const today = dateInEvaOrbit(now);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const week = weekRange(now);
  const lastOccurredAt = entries[0]?.occurredAt ?? null;
  const reminderDue = reminders.some((reminder) => trackerReminderShouldNotify(reminder, entries, now));
  return {
    today: entries.filter((entry) => dateInEvaOrbit(new Date(entry.occurredAt)) === today).length,
    week: entries.filter((entry) => entry.occurredAt >= week.from && entry.occurredAt < week.to).length,
    month: entries.filter((entry) => dateInEvaOrbit(new Date(entry.occurredAt)).startsWith(month)).length,
    year: entries.filter((entry) => dateInEvaOrbit(new Date(entry.occurredAt)).startsWith(year)).length,
    total: entries.length, lastOccurredAt, reminderDue,
  };
}

export async function listTrackerSummaries(): Promise<TrackerSummary[]> {
  const repository = await getRepository();
  const trackers = await repository.listTrackers();
  const [entries, reminders] = await Promise.all([
    repository.listTrackerEntries(undefined),
    Promise.all(trackers.map((tracker) => repository.listTrackerReminders(tracker.id))),
  ]);
  return trackers.map((tracker, index) => {
    return { ...tracker, stats: stats(entries.filter((entry) => entry.trackerId === tracker.id), reminders[index]) };
  });
}

export async function getTrackerDetail(id: number, query = "") {
  const repository = await getRepository();
  const tracker = await repository.getTracker(id);
  if (!tracker) return null;
  const [fields, goals, reminders, allEntries] = await Promise.all([
    repository.listTrackerFields(id), repository.listTrackerGoals(id), repository.listTrackerReminders(id), repository.listTrackerEntries(id),
  ]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const entries = normalizedQuery ? allEntries.filter((entry) => `${entry.note} ${JSON.stringify(entry.values)}`.toLocaleLowerCase().includes(normalizedQuery)) : allEntries;
  return { tracker, fields, goals, reminders, entries, stats: stats(allEntries, reminders), insights: buildTrackerInsights(allEntries, fields) };
}

export async function createTracker(input: NewTracker) { return (await getRepository()).createTracker(input); }
export async function updateTracker(id: number, input: Record<string, unknown>) {
  const repository = await getRepository();
  const tracker = await repository.updateTracker(id, input);
  if (tracker && input.name !== undefined) {
    for (const rule of await repository.listTrackerReminders(id)) if (rule.reminderId) await repository.updateReminder(rule.reminderId, { title: tracker.name });
  }
  return tracker;
}
export async function deleteTracker(id: number) {
  const repository = await getRepository();
  if (!await repository.getTracker(id)) return false;
  for (const rule of await repository.listTrackerReminders(id)) if (rule.reminderId) await repository.updateReminder(rule.reminderId, { isActive: false, status: "cancelled", cancelledAt: new Date().toISOString(), snoozedUntil: null });
  await resetTrackerIcon(id);
  return repository.deleteTracker(id);
}
export async function createTrackerField(input: NewTrackerField) {
  const tracker = await (await getRepository()).getTracker(input.trackerId);
  if (!tracker) throw new ValidationError("Tracker 不存在");
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
  const fields = await repository.listTrackerFields(tracker.id);
  return repository.createTrackerEntry({ ...input, values: validatedValues(fields, input.values) });
}
export async function updateTrackerEntry(id: number, input: Record<string, unknown>) { return (await getRepository()).updateTrackerEntry(id, input); }
export async function deleteTrackerEntry(id: number) { return (await getRepository()).deleteTrackerEntry(id); }
export async function createTrackerGoal(input: NewTrackerGoal) { return (await getRepository()).createTrackerGoal(input); }
export async function deleteTrackerGoal(id: number) { return (await getRepository()).deleteTrackerGoal(id); }
function reminderInput(rule: TrackerReminder, title: string): Omit<Reminder, "id" | "lastCompletedAt" | "snoozedUntil" | "lastNotifiedAt" | "sentAt" | "cancelledAt" | "createdAt" | "updatedAt"> {
  return { title, targetType: "tracker", targetId: rule.trackerId, sourceType: `tracker_${rule.reminderMode}`, sourceId: rule.id, scheduleType: "interval", startsAt: rule.nextDueAt, nextDueAt: rule.nextDueAt, dueHasExplicitTime: true, intervalValue: rule.periodDays, intervalUnit: "day", timesOfDay: [], endsAt: null, timezone: rule.timezone, note: rule.reminderMode === "missing" ? "Only remind when this Tracker has no entry in the current observation period." : "", leadTimeMinutes: 0, repeatWhileOverdue: false, status: rule.enabled ? "scheduled" : "cancelled", isActive: rule.enabled };
}

async function syncTrackerReminder(rule: TrackerReminder) {
  const repository = await getRepository();
  const tracker = await repository.getTracker(rule.trackerId);
  if (!tracker) throw new ValidationError("Tracker 不存在");
  if (rule.enabled) {
    const nextDueAt=nextTrackerNotification(rule,await repository.listTrackerEntries(rule.trackerId));
    if(nextDueAt!==rule.nextDueAt){rule={...rule,nextDueAt};await repository.updateTrackerReminder(rule.id,{nextDueAt});}
  }
  if (!rule.reminderId) {
    const reminder = await repository.createReminder(reminderInput(rule, tracker.name));
    return repository.updateTrackerReminder(rule.id, { reminderId: reminder.id });
  }
  await repository.updateReminder(rule.reminderId, { ...reminderInput(rule, tracker.name), cancelledAt: rule.enabled ? null : new Date().toISOString(), lastNotifiedAt: null, sentAt: null });
  return rule;
}

export async function createTrackerReminder(input: NewTrackerReminder) {
  const repository = await getRepository();
  if (!await repository.getTracker(input.trackerId)) throw new ValidationError("Tracker 不存在");
  const rule = await repository.createTrackerReminder(input);
  return (await syncTrackerReminder(rule)) ?? rule;
}
export async function updateTrackerReminder(id: number, input: NewTrackerReminder) {
  const repository = await getRepository();
  const existing = await repository.getTrackerReminder(id);
  if (!existing) return null;
  const updated = await repository.updateTrackerReminder(id, { ...input, trackerId: undefined, reminderId: existing.reminderId });
  if (!updated) return null;
  await syncTrackerReminder(updated);
  return repository.getTrackerReminder(id);
}
export async function deleteTrackerReminder(id: number) {
  const repository = await getRepository();
  const rule = await repository.getTrackerReminder(id);
  if (!rule) return false;
  if (rule.reminderId) await repository.updateReminder(rule.reminderId, { isActive: false, status: "cancelled", cancelledAt: new Date().toISOString(), snoozedUntil: null });
  return repository.deleteTrackerReminder(id);
}

export async function getTodayNativeTrackerEntries() {
  const repository = await getRepository();
  const range = dateRange(dateInEvaOrbit());
  return repository.listTrackerEntries(undefined, range);
}
