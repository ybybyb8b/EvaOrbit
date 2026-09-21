import "server-only";

import { ConflictError } from "../errors";
import { effectiveDueAt, nextTrackerNotification, reminderActionPatch, selectDueReminders, snoozeUntil, trackerReminderNextDueAt, trackerReminderShouldNotify } from "../reminder-engine";
import { reminderSourceDefinition, reminderSourceLabel } from "../reminder-source-registry";
import { getRepository } from "../repositories";
import type { NewReminder } from "../repositories/types";
import type { DueReminder, Reminder, ScheduledNotification } from "../types";
import { completeCatRoutine, skipCatRoutineOccurrence } from "./cat-routine";
import { periodMedicationSnoozeDeadline, reconcilePeriodMedicationReminder, reconcilePeriodMedicationReminders } from "./period-medication-reminder";
import { catchUpAutomaticSubscriptionPayments, disableSubscriptionReminder, recordSubscriptionPaymentFromReminder, skipSubscriptionRenewal } from "./subscription";
import { completeTaskFromReminder, disableTaskReminder } from "./task";

async function subjectLabel(reminder: Reminder) {
  if (reminder.targetType === "cat_household") return "Household";
  if (reminder.targetType === "cat" && reminder.targetId) return (await (await getRepository()).getPet(reminder.targetId))?.name ?? "Cat";
  if (reminder.targetType === "tracker" && reminder.targetId) return (await (await getRepository()).getTracker(reminder.targetId))?.name ?? "Tracker";
  if (reminder.targetType === "subscription" && reminder.targetId) return (await (await getRepository()).getSubscription(reminder.targetId))?.name ?? "Subscription";
  if (reminder.targetType === "task") return "Task";
  return reminder.targetType === "health" ? "Health" : reminder.targetType;
}

async function validateTarget(input: NewReminder) {
  const repository = await getRepository();
  if (input.targetType === "cat" && (!input.targetId || !await repository.getPet(input.targetId))) throw new ConflictError("Cat not found.");
  if (input.targetType === "tracker" && (!input.targetId || !await repository.getTracker(input.targetId))) throw new ConflictError("Tracker not found.");
}

export async function listReminders(input: { targetType?: string; targetId?: number | null; activeOnly?: boolean } = {}) { return (await getRepository()).listReminders(input); }
export async function createReminder(input: NewReminder) {
  await validateTarget(input);
  if (reminderSourceDefinition(input.sourceType).projectionOwner !== "reminder") throw new ConflictError("This Reminder source is managed by its owning module.");
  return (await getRepository()).createReminder(input);
}
export async function updateReminder(id: number, input: Record<string, unknown>) {
  const repository = await getRepository(), existing = await repository.getReminder(id);
  if (!existing) return null;
  if (reminderSourceDefinition(existing.sourceType).projectionOwner !== "reminder") throw new ConflictError("This Reminder projection must be updated through its owning module.");
  const nextSource = input.sourceType === undefined ? existing.sourceType : input.sourceType === null ? null : String(input.sourceType);
  if (reminderSourceDefinition(nextSource).projectionOwner !== "reminder") throw new ConflictError("This Reminder source is managed by its owning module.");
  return repository.updateReminder(id, input);
}

export async function cancelReminder(id: number) {
  const repository = await getRepository(), reminder = await repository.getReminder(id);
  if (!reminder) return false;
  const source = reminderSourceDefinition(reminder.sourceType);
  if (source.projectionOwner === "cat_routine" && reminder.sourceId) { await skipCatRoutineOccurrence(reminder.sourceId); return true; }
  if (source.projectionOwner === "tracker" && reminder.sourceId) await repository.updateTrackerReminder(reminder.sourceId, { enabled: false });
  if (source.projectionOwner === "medication_preset" && reminder.sourceId) {
    await repository.updateMedicationPreset(reminder.sourceId, { reminderEnabled: false });
    await reconcilePeriodMedicationReminder(reminder.sourceId);
    return true;
  }
  if(source.projectionOwner==="subscription"&&reminder.sourceId)return disableSubscriptionReminder(reminder.sourceId);
  if (source.projectionOwner === "task" && reminder.sourceId) return disableTaskReminder(reminder.sourceId);
  const now = new Date().toISOString();
  await repository.createNotificationDelivery({ reminderId: reminder.id, title: reminder.title, sourceType: reminder.sourceType, sourceId: reminder.sourceId, targetType: reminder.targetType, targetId: reminder.targetId, scheduledAt: effectiveDueAt(reminder) ?? reminder.startsAt, scheduledHasExplicitTime: reminder.dueHasExplicitTime, sentAt: null, status: "cancelled" });
  await repository.updateReminder(id, { isActive: false, status: "cancelled", cancelledAt: now, snoozedUntil: null });
  return true;
}
export const deleteReminder = cancelReminder;

export async function listScheduledNotifications(now = new Date()): Promise<ScheduledNotification[]> {
  await catchUpAutomaticSubscriptionPayments(now);
  await reconcilePeriodMedicationReminders(now);
  const repository = await getRepository();
  const source = (await repository.listReminders({ activeOnly: true })).filter((reminder) => reminder.nextDueAt && (["scheduled", "failed"].includes(reminder.status) || (reminder.status === "sent" && reminder.repeatWhileOverdue)));
  const reminders = (await Promise.all(source.map(async (reminder) => {
    if(reminder.sourceType==="task_reminder"&&reminder.sourceId){const rule=await repository.getTaskReminder(reminder.sourceId);if(rule?.deliveryChannel==="apple_reminders"&&(!rule.repeatWhileOverdue||!reminder.overdueAfter||now.toISOString()<=reminder.overdueAfter))return null;}
    if (reminderSourceDefinition(reminder.sourceType).projectionOwner !== "tracker" || !reminder.sourceId) return reminder;
    const rule = await repository.getTrackerReminder(reminder.sourceId);
    if (!rule?.enabled) return null;
    return { ...reminder, nextDueAt: nextTrackerNotification(rule, await repository.listTrackerEntries(rule.trackerId), now), status: "scheduled" as const };
  }))).filter((item): item is Reminder => item !== null).sort((a, b) => {
    const aDay = a.nextDueAt!.slice(0, 10), bDay = b.nextDueAt!.slice(0, 10);
    if (aDay !== bDay) return aDay.localeCompare(bDay);
    if (a.dueHasExplicitTime !== b.dueHasExplicitTime) return a.dueHasExplicitTime ? -1 : 1;
    return a.nextDueAt!.localeCompare(b.nextDueAt!);
  });
  return Promise.all(reminders.map(async (reminder) => {
    const definition = reminderSourceDefinition(reminder.sourceType);
    return { ...reminder, subjectLabel: await subjectLabel(reminder), scheduledAt: reminder.nextDueAt!, sourceLabel: reminderSourceLabel(reminder.sourceType, reminder.targetType), isRoutine: definition.projectionOwner === "cat_routine" };
  }));
}

export async function listNotificationHistory(limit = 100) { return (await getRepository()).listNotificationDeliveries(limit); }

export async function getDueReminders(limit = 50, now = new Date()): Promise<DueReminder[]> {
  await catchUpAutomaticSubscriptionPayments(now);
  await reconcilePeriodMedicationReminders(now);
  const repository = await getRepository();
  const candidates = selectDueReminders(await repository.listReminders({ activeOnly: true }), now, limit * 2);
  const reminders = (await Promise.all(candidates.map(async (reminder) => {
    if (reminderSourceDefinition(reminder.sourceType).projectionOwner !== "tracker" || !reminder.sourceId) return reminder;
    const rule = await repository.getTrackerReminder(reminder.sourceId);
    return rule && trackerReminderShouldNotify(rule, await repository.listTrackerEntries(rule.trackerId), now) ? reminder : null;
  }))).filter((item): item is Reminder => item !== null).slice(0, limit);
  return Promise.all(reminders.map(async (reminder) => {
    const dueAt = effectiveDueAt(reminder)!;
    return { ...reminder, dueAt, overdueMs: now.getTime() - new Date(dueAt).getTime(), subjectLabel: await subjectLabel(reminder) };
  }));
}

async function advanceTrackerReminder(reminder: Reminder, action: "completed" | "skipped", actedAt: Date) {
  const repository = await getRepository(), rule = reminder.sourceId ? await repository.getTrackerReminder(reminder.sourceId) : null;
  if (!rule) throw new ConflictError("Tracker reminder rule not found.");
  const scheduledFor = effectiveDueAt(reminder) ?? reminder.startsAt;
  await repository.createReminderOccurrence({ reminderId: reminder.id, action, scheduledFor, actedAt: actedAt.toISOString(), createdEventId: null });
  const nextDueAt = nextTrackerNotification({ ...rule, nextDueAt: trackerReminderNextDueAt(rule) }, [], actedAt);
  await repository.updateTrackerReminder(rule.id, { nextDueAt });
  return repository.updateReminder(reminder.id, { nextDueAt, status: "scheduled", snoozedUntil: null, lastNotifiedAt: null, sentAt: null, ...(action === "completed" ? { lastCompletedAt: actedAt.toISOString() } : {}) });
}

export async function completeReminder(id: number, actedAt = new Date()) {
  const repository = await getRepository(), reminder = await repository.getReminder(id);
  if (!reminder?.isActive) throw new ConflictError("Reminder not found or inactive.");
  const source = reminderSourceDefinition(reminder.sourceType);
  if (source.projectionOwner === "cat_routine" && reminder.sourceId) return completeCatRoutine(reminder.sourceId, actedAt);
  if (source.projectionOwner === "tracker") return advanceTrackerReminder(reminder, "completed", actedAt);
  if(source.projectionOwner==="subscription"&&reminder.sourceId)return recordSubscriptionPaymentFromReminder(reminder.sourceId,actedAt);
  if (source.projectionOwner === "task" && reminder.sourceId) {
    await repository.createReminderOccurrence({reminderId:id,action:"completed",scheduledFor:effectiveDueAt(reminder)??reminder.startsAt,actedAt:actedAt.toISOString(),createdEventId:null});
    await completeTaskFromReminder(reminder.sourceId);
    return repository.getReminder(id);
  }
  let createdEventId: number | null = null;
  if (reminder.scheduleType === "interval" && (reminder.targetType === "cat" || reminder.targetType === "cat_household")) {
    const event = await repository.createCatEvent({ petId: reminder.targetType === "cat" ? reminder.targetId : null, eventType: reminder.targetType === "cat" ? "care" : "cleaning", occurredAt: actedAt.toISOString(), occurredHasExplicitTime: true, title: reminder.title, note: "", sourceType: "reminder", sourceId: reminder.id });
    createdEventId = event.id;
  }
  await repository.createReminderOccurrence({ reminderId: id, action: "completed", scheduledFor: effectiveDueAt(reminder) ?? reminder.startsAt, actedAt: actedAt.toISOString(), createdEventId });
  return repository.updateReminder(id, { ...reminderActionPatch(reminder, "complete", actedAt), status: reminder.scheduleType === "one_time" ? "completed" : "scheduled", sentAt: reminder.scheduleType === "one_time" ? reminder.sentAt : null, lastNotifiedAt: reminder.scheduleType === "one_time" ? reminder.lastNotifiedAt : null });
}

export async function skipReminder(id: number, actedAt = new Date()) {
  const repository = await getRepository(), reminder = await repository.getReminder(id);
  if (!reminder?.isActive) throw new ConflictError("Reminder not found or inactive.");
  const source = reminderSourceDefinition(reminder.sourceType);
  if (source.projectionOwner === "cat_routine" && reminder.sourceId) return skipCatRoutineOccurrence(reminder.sourceId, actedAt);
  if (source.projectionOwner === "tracker") return advanceTrackerReminder(reminder, "skipped", actedAt);
  if(source.projectionOwner==="subscription"&&reminder.sourceId)return skipSubscriptionRenewal(reminder.sourceId);
  const scheduledFor = effectiveDueAt(reminder) ?? reminder.startsAt;
  await repository.createReminderOccurrence({ reminderId: id, action: "skipped", scheduledFor, actedAt: actedAt.toISOString(), createdEventId: null });
  if (source.projectionOwner === "medication_preset") return repository.updateReminder(id, { isActive: false, nextDueAt: null, snoozedUntil: null, status: "completed", lastCompletedAt: actedAt.toISOString() });
  return repository.updateReminder(id, { ...reminderActionPatch(reminder, "skip", actedAt), status: reminder.scheduleType === "one_time" ? "cancelled" : "scheduled", cancelledAt: reminder.scheduleType === "one_time" ? actedAt.toISOString() : null, lastNotifiedAt: null });
}

export async function snoozeReminder(id: number, choice: "later_today" | "tomorrow" | "custom", custom?: string, now = new Date()) {
  const repository = await getRepository(), reminder = await repository.getReminder(id);
  if (!reminder?.isActive) throw new ConflictError("Reminder not found or inactive.");
  const source = reminderSourceDefinition(reminder.sourceType), snoozedUntil = snoozeUntil(choice, now, custom, reminder.timezone);
  const deadline = await periodMedicationSnoozeDeadline(reminder, now);
  if (source.domainRule === "period_medication" && (!deadline || snoozedUntil >= deadline)) throw new ConflictError("Snooze time must remain inside the current reminder window.");
  return repository.updateReminder(id, { snoozedUntil, ...(source.domainRule === "period_medication" ? { status: "scheduled" } : {}) });
}
