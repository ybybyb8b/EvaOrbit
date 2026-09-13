import type { MedicationDoseEvent, MedicationPreset, MenstrualPeriod } from "./types.ts";
import { shiftDate, zonedDateTimeToUtc } from "./time.ts";
import { PERIOD_MEDICATION_REMINDER_SOURCE } from "./reminder-source-registry.ts";

export { PERIOD_MEDICATION_REMINDER_SOURCE };
export const PERIOD_MEDICATION_REMINDER_TIMEZONE = "Asia/Shanghai";

export type PeriodMedicationReminderProjection = {
  title: string;
  startsAt: string;
  nextDueAt: string;
  endsAt: string;
};

export function periodMedicationWindow(period: Pick<MenstrualPeriod, "startedOn" | "endedOn">) {
  const from = zonedDateTimeToUtc(period.startedOn, "00:00", PERIOD_MEDICATION_REMINDER_TIMEZONE);
  const threeDayEnd = zonedDateTimeToUtc(shiftDate(period.startedOn, 3), "00:00", PERIOD_MEDICATION_REMINDER_TIMEZONE);
  const recordedEnd = period.endedOn
    ? zonedDateTimeToUtc(shiftDate(period.endedOn, 1), "00:00", PERIOD_MEDICATION_REMINDER_TIMEZONE)
    : null;
  return { from, to: recordedEnd && recordedEnd < threeDayEnd ? recordedEnd : threeDayEnd };
}

export function activePeriodMedicationPeriod(periods: MenstrualPeriod[], now = new Date()) {
  const timestamp = now.getTime();
  return periods
    .filter((period) => {
      const window = periodMedicationWindow(period);
      return new Date(window.from).getTime() <= timestamp && timestamp < new Date(window.to).getTime();
    })
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn) || b.id - a.id)[0] ?? null;
}

export function periodMedicationReminderProjection(
  preset: MedicationPreset,
  period: MenstrualPeriod | null,
  doses: MedicationDoseEvent[],
  now = new Date(),
): PeriodMedicationReminderProjection | null {
  if (!period || preset.archivedAt || !preset.reminderEnabled || !preset.periodLinkEnabled) return null;
  const window = periodMedicationWindow(period);
  const timestamp = now.getTime();
  if (timestamp < new Date(window.from).getTime() || timestamp >= new Date(window.to).getTime()) return null;
  const latest = doses
    .filter((dose) => dose.medicationPresetId === preset.id && dose.periodId === period.id && dose.takenAt >= window.from && dose.takenAt < window.to)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt) || b.id - a.id)[0];
  if (!latest) return null;
  const nextDueAt = new Date(new Date(latest.takenAt).getTime() + preset.minReminderIntervalMinutes * 60_000).toISOString();
  if (nextDueAt >= window.to) return null;
  return { title: preset.name, startsAt: latest.takenAt, nextDueAt, endsAt: window.to };
}
