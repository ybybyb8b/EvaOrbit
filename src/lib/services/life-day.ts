import "server-only";
import { matchingCalendarRule } from "../calendar-interpretation";
import { recurrenceCompletionDate } from "../life-day";
import { actualSleepSessions } from "../sleep";
import { shiftDate, zonedDateParts, zonedDateTimeToUtc } from "../time";
import { getRepository } from "../repositories";
import { getHealthKitSleepSamples } from "./sleep";
import { isReminderTime } from "../meal-reminders";
import { ValidationError } from "../validation";

export async function getLifeDayStart() { return (await getRepository()).getLifeDayStart(); }
export async function updateLifeDayStart(value: unknown) {
  if (!isReminderTime(value)) throw new ValidationError("请选择有效的生活日切换时间（HH:mm）");
  await (await getRepository()).updateLifeDayStart(value);
  return { fallbackTime: value };
}

export async function getRecurrenceCompletionDate(actedAt: Date, scheduledAt: string, timezone: string) {
  if (!Number.isFinite(actedAt.getTime())) throw new ValidationError("完成时间不正确");
  const repository = await getRepository();
  const date = zonedDateParts(actedAt, timezone).date;
  const [fallbackTime, samples, events, interpretation] = await Promise.all([
    repository.getLifeDayStart(), getHealthKitSleepSamples(date),
    repository.listCalendarEvents({ from: zonedDateTimeToUtc(shiftDate(date, -2), "00:00", timezone), to: zonedDateTimeToUtc(shiftDate(date, 2), "00:00", timezone), status: "confirmed", limit: 500 }),
    repository.getCalendarInterpretation(),
  ]);
  const actual = actualSleepSessions(samples);
  const actualDates = new Set(actual.map(sleep => zonedDateParts(sleep.endAt, timezone).date));
  const calendar = events.filter(event => !event.isAllDay && event.status === "confirmed"
    && interpretation.categories.find(category => category.id === matchingCalendarRule(event.title, interpretation)?.categoryId)?.kind === "sleep"
    && !actualDates.has(zonedDateParts(event.endAt, timezone).date))
    .map(event => ({ startAt: event.startAt, endAt: event.endAt, durationMinutes: (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000 }));
  return recurrenceCompletionDate(actedAt, scheduledAt, timezone, fallbackTime, [...actual, ...calendar]);
}
