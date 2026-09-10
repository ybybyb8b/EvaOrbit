import type { CatRoutine, Reminder, ReminderIntervalUnit, TrackerEntry, TrackerReminder } from "./types.ts";
import { addCalendarInterval, zonedDateParts, zonedDateTimeToUtc } from "./time.ts";

export function addReminderInterval(value: string | Date, amount: number, unit: ReminderIntervalUnit) {
  const next = new Date(value);
  if (unit === "hour") next.setUTCHours(next.getUTCHours() + amount);
  if (unit === "day") next.setUTCDate(next.getUTCDate() + amount);
  if (unit === "week") next.setUTCDate(next.getUTCDate() + amount * 7);
  if (unit === "month") next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}

type RoutineSchedule = Pick<CatRoutine, "intervalValue" | "intervalUnit" | "recurrenceMode" | "anchorDate" | "nextDueDate" | "configuredReminderTime" | "timezone">;

export function catRoutineCompletionPatch(routine: RoutineSchedule, actedAt = new Date()) {
  const completedDate = zonedDateParts(actedAt, routine.timezone).date;
  const plannedNextDate = addCalendarInterval(routine.nextDueDate, routine.intervalValue, routine.intervalUnit);
  const reanchor = routine.recurrenceMode === "completion" || completedDate >= plannedNextDate;
  const anchorDate = reanchor ? completedDate : routine.anchorDate;
  const nextDueDate = reanchor ? addCalendarInterval(completedDate, routine.intervalValue, routine.intervalUnit) : plannedNextDate;
  return { lastCompletedAt: actedAt.toISOString(), anchorDate, nextDueDate, nextDueAt: zonedDateTimeToUtc(nextDueDate, routine.configuredReminderTime, routine.timezone) };
}
export function catRoutineSkipPatch(routine: Pick<CatRoutine, "nextDueDate" | "intervalValue" | "intervalUnit" | "configuredReminderTime" | "timezone">) {
  const nextDueDate = addCalendarInterval(routine.nextDueDate, routine.intervalValue, routine.intervalUnit);
  return { nextDueDate, nextDueAt: zonedDateTimeToUtc(nextDueDate, routine.configuredReminderTime, routine.timezone) };
}

export function trackerReminderNextDueAt(rule: Pick<TrackerReminder, "nextDueAt" | "periodDays" | "configuredTime" | "timezone">) {
  const nextDate = addCalendarInterval(zonedDateParts(rule.nextDueAt, rule.timezone).date, rule.periodDays, "day");
  return zonedDateTimeToUtc(nextDate, rule.configuredTime, rule.timezone);
}

export function trackerReminderWindow(rule: Pick<TrackerReminder, "nextDueAt" | "periodDays" | "timezone">) {
  const dueDate = zonedDateParts(rule.nextDueAt, rule.timezone).date;
  const fromDate = addCalendarInterval(dueDate, -(rule.periodDays - 1), "day");
  return { from: zonedDateTimeToUtc(fromDate, "00:00", rule.timezone), to: rule.nextDueAt };
}

export function trackerReminderHasEntry(rule: Pick<TrackerReminder, "nextDueAt" | "periodDays" | "timezone">, entries: Pick<TrackerEntry, "occurredAt">[]) {
  const window = trackerReminderWindow(rule);
  return entries.some((entry) => entry.occurredAt >= window.from && entry.occurredAt <= window.to);
}

export function trackerReminderShouldNotify(rule: TrackerReminder, entries: Pick<TrackerEntry, "occurredAt">[], now = new Date()) {
  return rule.enabled && new Date(rule.nextDueAt).getTime() <= now.getTime() && (rule.reminderMode === "standard" || !trackerReminderHasEntry(rule, entries));
}

export function nextTrackerNotification(rule: TrackerReminder, entries: Pick<TrackerEntry, "occurredAt">[], now = new Date()) {
  let candidate = rule;
  for (let count = 0; count < 10_000; count += 1) {
    const past = new Date(candidate.nextDueAt).getTime() <= now.getTime();
    const skipped = candidate.reminderMode === "missing" && trackerReminderHasEntry(candidate, entries);
    if (!past && !skipped) return candidate.nextDueAt;
    candidate = { ...candidate, nextDueAt: trackerReminderNextDueAt(candidate) };
  }
  throw new Error("Tracker reminder schedule could not be advanced");
}

export function effectiveDueAt(reminder: Pick<Reminder, "nextDueAt" | "snoozedUntil">) {
  return reminder.snoozedUntil ?? reminder.nextDueAt;
}

export function notificationSendAt(reminder: Pick<Reminder, "nextDueAt" | "snoozedUntil" | "leadTimeMinutes" | "dueHasExplicitTime">) {
  if (!reminder.dueHasExplicitTime && !reminder.snoozedUntil) return null;
  const dueAt = effectiveDueAt(reminder);
  if (!dueAt) return null;
  const scheduled = new Date(dueAt);
  if (!reminder.snoozedUntil) scheduled.setUTCMinutes(scheduled.getUTCMinutes() - reminder.leadTimeMinutes);
  return scheduled.toISOString();
}

export function notificationDeliverySlot(reminder: Pick<Reminder, "nextDueAt" | "snoozedUntil" | "leadTimeMinutes" | "dueHasExplicitTime" | "timezone" | "repeatWhileOverdue">, now = new Date()) {
  const initial = notificationSendAt(reminder);
  const dueAt = effectiveDueAt(reminder);
  if (!initial || !dueAt) return null;
  const due = zonedDateParts(dueAt, reminder.timezone);
  const current = zonedDateParts(now, reminder.timezone);
  if (!reminder.repeatWhileOverdue || current.date <= due.date) return initial;
  const daily = zonedDateTimeToUtc(current.date, due.time, reminder.timezone);
  return new Date(daily).getTime() <= now.getTime() ? daily : null;
}

export function notificationShouldSend(reminder: Pick<Reminder, "nextDueAt" | "snoozedUntil" | "leadTimeMinutes" | "lastNotifiedAt" | "dueHasExplicitTime" | "timezone" | "repeatWhileOverdue">, now = new Date()) {
  const scheduledAt = notificationDeliverySlot(reminder, now);
  return Boolean(scheduledAt) && new Date(scheduledAt!).getTime() <= now.getTime() && (!reminder.lastNotifiedAt || new Date(reminder.lastNotifiedAt).getTime() < new Date(scheduledAt!).getTime());
}

export function reminderIsDue(reminder: Pick<Reminder, "isActive" | "nextDueAt" | "snoozedUntil" | "dueHasExplicitTime">, now = new Date()) {
  if (!reminder.dueHasExplicitTime && !reminder.snoozedUntil) return false;
  const dueAt = effectiveDueAt(reminder);
  return reminder.isActive && Boolean(dueAt) && new Date(dueAt!).getTime() <= now.getTime();
}

export function selectDueReminders<T extends Pick<Reminder,"isActive"|"nextDueAt"|"snoozedUntil"|"dueHasExplicitTime">>(reminders:T[],now=new Date(),limit=50){return reminders.filter(item=>reminderIsDue(item,now)).sort((a,b)=>(effectiveDueAt(a)??"").localeCompare(effectiveDueAt(b)??"")).slice(0,limit);}

export function reminderActionPatch(reminder: Reminder, action: "complete" | "skip", actedAt = new Date()) {
  const scheduled = effectiveDueAt(reminder) ?? reminder.startsAt;
  if (reminder.scheduleType === "one_time") {
    return { isActive: false, nextDueAt: null, snoozedUntil: null, ...(action === "complete" ? { lastCompletedAt: actedAt.toISOString() } : {}) };
  }
  if (!reminder.intervalValue || !reminder.intervalUnit) throw new Error("Recurring reminder has no interval");
  const base = action === "complete" ? actedAt : new Date(scheduled);
  const next = reminder.scheduleType === "course" ? nextCourseTime(reminder,base) ?? addReminderInterval(base,reminder.intervalValue,reminder.intervalUnit) : addReminderInterval(base,reminder.intervalValue,reminder.intervalUnit);
  const expired = reminder.endsAt !== null && next.getTime() > new Date(reminder.endsAt).getTime();
  return {
    isActive: !expired,
    nextDueAt: expired ? null : next.toISOString(),
    snoozedUntil: null,
    ...(action === "complete" ? { lastCompletedAt: actedAt.toISOString() } : {}),
  };
}

function zonedParts(value:Date,timeZone:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(value);const get=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(part=>part.type===type)?.value);return{year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute"),second:get("second")};}
function zonedLocalToUtc(year:number,month:number,day:number,hour:number,timeZone:string){const wallClock=Date.UTC(year,month-1,day,hour);let guess=wallClock;for(let attempt=0;attempt<2;attempt++){const parts=zonedParts(new Date(guess),timeZone);const represented=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);guess-=represented-wallClock;}return new Date(guess);}
function nextCourseTime(reminder:Reminder,base:Date){const times=[...reminder.timesOfDay].sort();if(!times.length)return null;const local=zonedParts(base,reminder.timezone);for(let offset=0;offset<=370;offset++){const day=new Date(Date.UTC(local.year,local.month-1,local.day+offset));for(const value of times){const[hour,minute]=value.split(":").map(Number);const candidate=zonedLocalToUtc(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),hour,reminder.timezone);candidate.setUTCMinutes(candidate.getUTCMinutes()+minute);if(candidate>base)return candidate;}}return null;}

export function snoozeUntil(choice: "later_today" | "tomorrow" | "custom", now = new Date(), custom?: string, timeZone="Asia/Shanghai") {
  if (choice === "custom") {
    const date = new Date(custom ?? "");
    if (!Number.isFinite(date.getTime()) || date <= now) throw new Error("Snooze time must be in the future");
    return date.toISOString();
  }
  const result = new Date(now);
  if (choice === "later_today") result.setTime(result.getTime() + 3 * 60 * 60 * 1000);
  else {const parts=zonedParts(now,timeZone);const tomorrow=new Date(Date.UTC(parts.year,parts.month-1,parts.day+1,9));return zonedLocalToUtc(tomorrow.getUTCFullYear(),tomorrow.getUTCMonth()+1,tomorrow.getUTCDate(),9,timeZone).toISOString();}
  return result.toISOString();
}
