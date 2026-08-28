import type { CatRoutine, Reminder, ReminderIntervalUnit } from "./types.ts";

export function addReminderInterval(value: string | Date, amount: number, unit: ReminderIntervalUnit) {
  const next = new Date(value);
  if (unit === "hour") next.setUTCHours(next.getUTCHours() + amount);
  if (unit === "day") next.setUTCDate(next.getUTCDate() + amount);
  if (unit === "week") next.setUTCDate(next.getUTCDate() + amount * 7);
  if (unit === "month") next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}

export function catRoutineCompletionPatch(routine: Pick<CatRoutine, "intervalValue" | "intervalUnit">, actedAt = new Date()) { return { lastCompletedAt: actedAt.toISOString(), nextDueAt: addReminderInterval(actedAt, routine.intervalValue, routine.intervalUnit).toISOString() }; }
export function catRoutineSkipPatch(routine: Pick<CatRoutine, "nextDueAt" | "intervalValue" | "intervalUnit">) { return { nextDueAt: addReminderInterval(routine.nextDueAt, routine.intervalValue, routine.intervalUnit).toISOString() }; }

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

export function notificationShouldSend(reminder: Pick<Reminder, "nextDueAt" | "snoozedUntil" | "leadTimeMinutes" | "lastNotifiedAt" | "dueHasExplicitTime">, now = new Date()) {
  const scheduledAt = notificationSendAt(reminder);
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
