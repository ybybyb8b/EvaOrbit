import "server-only";

import { ConflictError, HttpError } from "../errors";
import { catRoutineCompletionPatch, catRoutineSkipPatch } from "../reminder-engine";
import { getRepository } from "../repositories";
import type { NewCatRoutine } from "../repositories/types";
import type { CatRoutine, Reminder } from "../types";
import { REMINDER_SOURCE_REGISTRY } from "../reminder-source-registry";
import { getRecurrenceCompletionDate } from "./life-day";

const RESET_NOTIFICATION = {
  status: "scheduled" as const,
  sentAt: null,
  cancelledAt: null,
  snoozedUntil: null,
  lastNotifiedAt: null,
};

async function requireRoutine(id: number) {
  const repository = await getRepository();
  const routine = await repository.getCatRoutine(id);
  if (!routine) throw new ConflictError("Routine not found.");
  return { repository, routine };
}

async function validateRoutineTarget(input: Pick<NewCatRoutine, "scope" | "petId">) {
  if (input.scope === "cat") {
    const repository = await getRepository();
    if (!input.petId || !await repository.getPet(input.petId)) throw new ConflictError("Cat not found.");
  }
}

function reminderInput(routine: CatRoutine): Omit<Reminder, "id" | "lastCompletedAt" | "snoozedUntil" | "lastNotifiedAt" | "sentAt" | "cancelledAt" | "createdAt" | "updatedAt"> {
  return {
    title: routine.title,
    targetType: routine.scope === "cat" ? "cat" : "cat_household",
    targetId: routine.scope === "cat" ? routine.petId : null,
    sourceType: REMINDER_SOURCE_REGISTRY.cat_routine.sourceType,
    sourceId: routine.id,
    scheduleType: "one_time",
    startsAt: routine.firstDueAt,
    nextDueAt: routine.nextDueAt,
    dueHasExplicitTime: true,
    intervalValue: null,
    intervalUnit: null,
    timesOfDay: [],
    endsAt: null,
    timezone: routine.timezone,
    note: routine.notes,
    leadTimeMinutes: routine.reminderLeadMinutes,
    repeatWhileOverdue: routine.repeatWhileOverdue,
    status: routine.enabled ? "scheduled" : "cancelled",
    isActive: routine.enabled,
  };
}

async function syncReminder(routine: CatRoutine) {
  const repository = await getRepository();
  if (!routine.reminderId) {
    const reminder = await repository.createReminder(reminderInput(routine));
    return repository.updateCatRoutine(routine.id, { reminderId: reminder.id });
  }
  await repository.updateReminder(routine.reminderId, {
    title: routine.title,
    targetType: routine.scope === "cat" ? "cat" : "cat_household",
    targetId: routine.scope === "cat" ? routine.petId : null,
    startsAt: routine.firstDueAt,
    nextDueAt: routine.nextDueAt,
    dueHasExplicitTime: true,
    note: routine.notes,
    leadTimeMinutes: routine.reminderLeadMinutes,
    repeatWhileOverdue: routine.repeatWhileOverdue,
    timezone: routine.timezone,
    isActive: routine.enabled,
    ...(routine.enabled ? RESET_NOTIFICATION : { status: "cancelled" as const, cancelledAt: new Date().toISOString(), snoozedUntil: null }),
  });
  return routine;
}

export async function listCatRoutines(input: { scope?: string; petId?: number | null; enabledOnly?: boolean } = {}) {
  return (await getRepository()).listCatRoutines(input);
}

export async function getCatRoutine(id: number) {
  return (await getRepository()).getCatRoutine(id);
}

export async function createCatRoutine(input: NewCatRoutine) {
  await validateRoutineTarget(input);
  const repository = await getRepository();
  const routine = await repository.createCatRoutine(input);
  const synced = await syncReminder(routine);
  return synced ?? routine;
}

export async function updateCatRoutine(id: number, input: Record<string, unknown>) {
  const { repository, routine } = await requireRoutine(id);
  const scope = (input.scope ?? routine.scope) as CatRoutine["scope"];
  const petId = input.petId === undefined ? routine.petId : input.petId as number | null;
  await validateRoutineTarget({ scope, petId });
  const updated = await repository.updateCatRoutine(id, input);
  if (!updated) return null;
  await syncReminder(updated);
  return repository.getCatRoutine(id);
}

export type RoutineCompletionExpectation = { expectedNextDueAt?: string; expectedLastCompletedAt?: string | null };
export async function completeCatRoutine(id: number, actedAt = new Date(), expected: RoutineCompletionExpectation = {}) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) throw new HttpError("Invalid completion request.", 400);
  for (const key of ["expectedNextDueAt", "expectedLastCompletedAt"] as const) {
    const value = expected[key];
    if (value !== undefined && !(key === "expectedLastCompletedAt" && value === null) && (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) throw new HttpError("Invalid completion occurrence.", 400);
  }
  if (!Number.isFinite(actedAt.getTime())) throw new HttpError("Invalid completion time.", 400);
  const { repository, routine } = await requireRoutine(id);
  if (!routine.enabled) throw new ConflictError("Routine is disabled.");
  const sameInstant = (a: string | null, b: string | null) => a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));
  if ((expected.expectedNextDueAt !== undefined && !sameInstant(expected.expectedNextDueAt, routine.nextDueAt))
    || (expected.expectedLastCompletedAt !== undefined && !sameInstant(expected.expectedLastCompletedAt, routine.lastCompletedAt))) return { routine, event: null, alreadyCompleted: true };
  const completionDate = await getRecurrenceCompletionDate(actedAt, routine.nextDueAt, routine.timezone);
  if (routine.lastCompletedAt) {
    const previousDate = await getRecurrenceCompletionDate(new Date(routine.lastCompletedAt), routine.nextDueAt, routine.timezone);
    if (completionDate <= previousDate) return { routine, event: null, alreadyCompleted: true };
  }
  const completion = catRoutineCompletionPatch(routine, actedAt, completionDate);
  const saved = await repository.completeCatRoutineOccurrence(id, routine, completion);
  return saved ?? { routine: await repository.getCatRoutine(id), event: null, alreadyCompleted: true };
}

export async function skipCatRoutineOccurrence(id: number, actedAt = new Date()) {
  const { repository, routine } = await requireRoutine(id);
  if (!routine.enabled) throw new ConflictError("Routine is disabled.");
  const nextDueAt = catRoutineSkipPatch(routine).nextDueAt;
  const updated = await repository.updateCatRoutine(id, { nextDueAt });
  if (routine.reminderId) {
    await repository.createReminderOccurrence({ reminderId: routine.reminderId, action: "skipped", scheduledFor: routine.nextDueAt, actedAt: actedAt.toISOString(), createdEventId: null });
    await repository.createNotificationDelivery({ reminderId: routine.reminderId, title: routine.title, sourceType: "cat_routine", sourceId: routine.id, targetType: routine.scope === "cat" ? "cat" : "cat_household", targetId: routine.petId, scheduledAt: routine.nextDueAt, scheduledHasExplicitTime: true, sentAt: null, status: "cancelled" });
    await repository.updateReminder(routine.reminderId, { nextDueAt, ...RESET_NOTIFICATION, isActive: true });
  }
  return updated;
}

export async function deleteCatRoutine(id: number) {
  const repository = await getRepository();
  const routine = await repository.getCatRoutine(id);
  if (!routine) return false;
  // Remove the owned projection first so a partial failure cannot leave active reminders.
  // Occurrences cascade with the reminder; generated care records remain independent.
  if (routine.reminderId) await repository.deleteReminder(routine.reminderId);
  return repository.deleteCatRoutine(id);
}

export async function archiveCatRoutine(id: number) {
  const { repository, routine } = await requireRoutine(id);
  const archived = await repository.archiveCatRoutine(id);
  if (archived && routine.reminderId) {
    await repository.createNotificationDelivery({ reminderId: routine.reminderId, title: routine.title, sourceType: "cat_routine", sourceId: routine.id, targetType: routine.scope === "cat" ? "cat" : "cat_household", targetId: routine.petId, scheduledAt: routine.nextDueAt, scheduledHasExplicitTime: true, sentAt: null, status: "cancelled" });
    await repository.updateReminder(routine.reminderId, { isActive: false, status: "cancelled", cancelledAt: new Date().toISOString(), snoozedUntil: null });
  }
  return archived;
}
