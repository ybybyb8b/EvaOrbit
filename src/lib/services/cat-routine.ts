import "server-only";

import { ConflictError } from "../errors";
import { catRoutineCompletionPatch, catRoutineSkipPatch } from "../reminder-engine";
import { getRepository } from "../repositories";
import type { NewCatRoutine } from "../repositories/types";
import type { CatRoutine, Reminder } from "../types";

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
    sourceType: "cat_routine",
    sourceId: routine.id,
    scheduleType: "one_time",
    startsAt: routine.firstDueAt,
    nextDueAt: routine.nextDueAt,
    intervalValue: null,
    intervalUnit: null,
    timesOfDay: [],
    endsAt: null,
    timezone: "Asia/Shanghai",
    note: routine.notes,
    leadTimeMinutes: routine.reminderLeadMinutes,
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
    nextDueAt: routine.nextDueAt,
    note: routine.notes,
    leadTimeMinutes: routine.reminderLeadMinutes,
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

export async function completeCatRoutine(id: number, actedAt = new Date()) {
  const { repository, routine } = await requireRoutine(id);
  if (!routine.enabled) throw new ConflictError("Routine is disabled.");
  if (routine.lastCompletedAt && actedAt.getTime() - new Date(routine.lastCompletedAt).getTime() < 30_000) throw new ConflictError("Routine was just completed.");
  const event = await repository.createCatEvent({
    petId: routine.scope === "cat" ? routine.petId : null,
    eventType: routine.scope === "cat" ? "care" : "cleaning",
    occurredAt: actedAt.toISOString(),
    title: routine.title,
    note: routine.notes,
    sourceType: "cat_routine",
    sourceId: routine.id,
  });
  const completion = catRoutineCompletionPatch(routine, actedAt);
  const nextDueAt = completion.nextDueAt;
  const updated = await repository.updateCatRoutine(id, completion);
  if (routine.reminderId) {
    await repository.createReminderOccurrence({ reminderId: routine.reminderId, action: "completed", scheduledFor: routine.nextDueAt, actedAt: actedAt.toISOString(), createdEventId: event.id });
    await repository.updateReminder(routine.reminderId, { nextDueAt, lastCompletedAt: actedAt.toISOString(), ...RESET_NOTIFICATION, isActive: true });
  }
  return { routine: updated, event };
}

export async function skipCatRoutineOccurrence(id: number, actedAt = new Date()) {
  const { repository, routine } = await requireRoutine(id);
  if (!routine.enabled) throw new ConflictError("Routine is disabled.");
  const nextDueAt = catRoutineSkipPatch(routine).nextDueAt;
  const updated = await repository.updateCatRoutine(id, { nextDueAt });
  if (routine.reminderId) {
    await repository.createReminderOccurrence({ reminderId: routine.reminderId, action: "skipped", scheduledFor: routine.nextDueAt, actedAt: actedAt.toISOString(), createdEventId: null });
    await repository.createNotificationDelivery({ reminderId: routine.reminderId, title: routine.title, sourceType: "cat_routine", sourceId: routine.id, targetType: routine.scope === "cat" ? "cat" : "cat_household", targetId: routine.petId, scheduledAt: routine.nextDueAt, sentAt: null, status: "cancelled" });
    await repository.updateReminder(routine.reminderId, { nextDueAt, ...RESET_NOTIFICATION, isActive: true });
  }
  return updated;
}

export async function archiveCatRoutine(id: number) {
  const { repository, routine } = await requireRoutine(id);
  const archived = await repository.archiveCatRoutine(id);
  if (archived && routine.reminderId) {
    await repository.createNotificationDelivery({ reminderId: routine.reminderId, title: routine.title, sourceType: "cat_routine", sourceId: routine.id, targetType: routine.scope === "cat" ? "cat" : "cat_household", targetId: routine.petId, scheduledAt: routine.nextDueAt, sentAt: null, status: "cancelled" });
    await repository.updateReminder(routine.reminderId, { isActive: false, status: "cancelled", cancelledAt: new Date().toISOString(), snoozedUntil: null });
  }
  return archived;
}
