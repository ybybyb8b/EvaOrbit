import { shiftDate, zonedDateParts, zonedDateTimeToUtc } from "./time.ts";

export const DEFAULT_LIFE_DAY_START = "06:00";
export type LifeDaySleep = { startAt: string; endAt: string; durationMinutes: number };

// Use the main sleep ending on this local date; absent sleep uses the user's cutoff.
// Secondary sleep episodes never introduce additional days.
export function lifeDayDate(at: Date, timezone: string, fallbackTime = DEFAULT_LIFE_DAY_START, sleeps: LifeDaySleep[] = []) {
  const { date } = zonedDateParts(at, timezone);
  const main = sleeps.filter(sleep => Number.isFinite(Date.parse(sleep.startAt)) && Date.parse(sleep.endAt) > Date.parse(sleep.startAt)
    && zonedDateParts(sleep.endAt, timezone).date === date)
    .sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
  const boundary = main?.endAt ?? zonedDateTimeToUtc(date, fallbackTime, timezone);
  return at.getTime() < Date.parse(boundary) ? shiftDate(date, -1) : date;
}

export function recurrenceCompletionDate(actedAt: Date, scheduledAt: string, timezone: string, fallbackTime = DEFAULT_LIFE_DAY_START, sleeps: LifeDaySleep[] = []) {
  const completedDay = lifeDayDate(actedAt, timezone, fallbackTime, sleeps);
  // A 01:00 occurrence belongs to the previous life day but retains its civil due date.
  const scheduledDay = lifeDayDate(new Date(scheduledAt), timezone, fallbackTime, sleeps);
  const scheduledDate = zonedDateParts(scheduledAt, timezone).date;
  return shiftDate(completedDay, scheduledDay < scheduledDate ? 1 : 0);
}
