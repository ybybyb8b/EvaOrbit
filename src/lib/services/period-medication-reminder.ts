import "server-only";

import { activePeriodMedicationPeriod, PERIOD_MEDICATION_REMINDER_SOURCE, PERIOD_MEDICATION_REMINDER_TIMEZONE, periodMedicationReminderProjection, periodMedicationWindow } from "../period-medication-reminder";
import { getRepository } from "../repositories";
import type { EvaOrbitRepository } from "../repositories/types";
import type { Reminder } from "../types";

function cancelledPatch(now: Date) {
  return { isActive: false, status: "cancelled", nextDueAt: null, snoozedUntil: null, cancelledAt: now.toISOString() };
}

async function applyProjection(repository: EvaOrbitRepository, preset: Awaited<ReturnType<EvaOrbitRepository["getMedicationPreset"]>>, period: ReturnType<typeof activePeriodMedicationPeriod>, doses: Awaited<ReturnType<EvaOrbitRepository["listMedicationDoseEvents"]>>, existing: Reminder | null, now: Date) {
  if (!preset) {
    if (existing?.isActive || (existing && existing.status !== "cancelled")) await repository.updateReminder(existing.id, cancelledPatch(now));
    return null;
  }
  const projection = periodMedicationReminderProjection(preset, period, doses, now);
  if (!projection) {
    if (existing?.isActive || (existing && existing.status !== "cancelled")) await repository.updateReminder(existing.id, cancelledPatch(now));
    return null;
  }
  if (!existing) {
    return repository.createReminder({
      title: projection.title,
      targetType: "health",
      targetId: null,
      sourceType: PERIOD_MEDICATION_REMINDER_SOURCE,
      sourceId: preset.id,
      scheduleType: "one_time",
      startsAt: projection.startsAt,
      nextDueAt: projection.nextDueAt,
      dueHasExplicitTime: true,
      intervalValue: null,
      intervalUnit: null,
      timesOfDay: [],
      endsAt: projection.endsAt,
      timezone: PERIOD_MEDICATION_REMINDER_TIMEZONE,
      note: "",
      leadTimeMinutes: 0,
      repeatWhileOverdue: false,
      status: "scheduled",
      isActive: true,
    });
  }
  const acknowledged = existing.startsAt === projection.startsAt && existing.status === "completed";
  const scheduleChanged = !acknowledged && (existing.startsAt !== projection.startsAt || existing.nextDueAt !== projection.nextDueAt);
  const snoozeExpired = existing.snoozedUntil !== null && existing.snoozedUntil >= projection.endsAt;
  const patch: Record<string, unknown> = {
    title: projection.title,
    targetType: "health",
    targetId: null,
    startsAt: projection.startsAt,
    nextDueAt: acknowledged ? null : projection.nextDueAt,
    endsAt: projection.endsAt,
    dueHasExplicitTime: true,
    repeatWhileOverdue: false,
  };
  if (scheduleChanged) Object.assign(patch, { isActive: true, status: "scheduled", snoozedUntil: null, lastNotifiedAt: null, sentAt: null, cancelledAt: null, lastCompletedAt: null });
  else if (!acknowledged && !existing.isActive) Object.assign(patch, { isActive: true, status: "scheduled", cancelledAt: null });
  if (snoozeExpired) patch.snoozedUntil = null;
  return repository.updateReminder(existing.id, patch);
}

async function reconcilePreset(repository: EvaOrbitRepository, presetId: number, now: Date) {
  const [preset, periods, reminders] = await Promise.all([repository.getMedicationPreset(presetId),repository.listMenstrualPeriods({ limit: 500 }),repository.listReminders()]);
  const period = activePeriodMedicationPeriod(periods, now);
  const doses = preset && period ? await repository.listMedicationDoseEvents({ medicationPresetId: preset.id, periodId: period.id, limit: 500 }) : [];
  const existing = reminders.find((item) => item.sourceType === PERIOD_MEDICATION_REMINDER_SOURCE && item.sourceId === presetId) ?? null;
  return applyProjection(repository,preset,period,doses,existing,now);
}

export async function reconcilePeriodMedicationReminder(presetId: number, now = new Date()) {
  return reconcilePreset(await getRepository(), presetId, now);
}

export async function reconcilePeriodMedicationReminders(now = new Date()) {
  const repository = await getRepository();
  const [presets, periods, reminders] = await Promise.all([
    repository.listMedicationPresets({ includeArchived: true, limit: 500 }),
    repository.listMenstrualPeriods({ limit: 500 }),
    repository.listReminders(),
  ]);
  const period = activePeriodMedicationPeriod(periods, now);
  const window = period ? periodMedicationWindow(period) : null;
  const doses = period && window ? await repository.listMedicationDoseEvents({ periodId: period.id, from: window.from, to: window.to, limit: 500 }) : [];
  const presetIds = new Set(presets.map((item) => item.id));
  const orphanIds = reminders
    .filter((item) => item.sourceType === PERIOD_MEDICATION_REMINDER_SOURCE && item.sourceId !== null && !presetIds.has(item.sourceId))
    .map((item) => item.id);
  for (const id of orphanIds) await repository.updateReminder(id, cancelledPatch(now));
  return Promise.all(presets.map((preset) => applyProjection(repository,preset,period,doses,reminders.find((item)=>item.sourceType===PERIOD_MEDICATION_REMINDER_SOURCE&&item.sourceId===preset.id)??null,now)));
}

export async function periodMedicationSnoozeDeadline(reminder: Reminder, now = new Date()) {
  if (reminder.sourceType !== PERIOD_MEDICATION_REMINDER_SOURCE || reminder.sourceId === null) return null;
  await reconcilePeriodMedicationReminder(reminder.sourceId, now);
  const current = await (await getRepository()).getReminder(reminder.id);
  return current?.isActive ? current.endsAt : null;
}
