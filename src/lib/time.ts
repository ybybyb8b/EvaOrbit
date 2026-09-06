export const EVAORBIT_TIME_ZONE = process.env.EVAORBIT_TIME_ZONE || "Asia/Shanghai";

export function zonedDateParts(value: string | Date, timeZone = EVAORBIT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

export function zonedDateTimeToUtc(date: string, time: string, timeZone = EVAORBIT_TIME_ZONE) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = zonedDateParts(new Date(guess), timeZone);
    const [shownYear, shownMonth, shownDay] = shown.date.split("-").map(Number);
    const [shownHour, shownMinute] = shown.time.split(":").map(Number);
    guess -= Date.UTC(shownYear, shownMonth - 1, shownDay, shownHour, shownMinute) - wallClock;
  }
  return new Date(guess).toISOString();
}

export function addCalendarInterval(date: string, amount: number, unit: "day" | "week" | "month") {
  const [year, month, day] = date.split("-").map(Number);
  if (unit !== "month") {
    const value = new Date(Date.UTC(year, month - 1, day + amount * (unit === "week" ? 7 : 1), 12));
    return value.toISOString().slice(0, 10);
  }
  const targetMonth = month - 1 + amount;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay), 12)).toISOString().slice(0, 10);
}

export function dateInEvaOrbit(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVAORBIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function offsetAt(utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVAORBIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utcMs));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second)) - utcMs;
}

function localMidnight(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  return new Date(guess - offsetAt(guess));
}

export function dateRange(date: string) {
  const start = localMidnight(date);
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
  return { from: start.toISOString(), to: localMidnight(nextDate).toISOString() };
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekRange(value = new Date()) {
  const date = dateInEvaOrbit(value);
  const noon = new Date(`${date}T12:00:00Z`);
  const day = noon.getUTCDay() || 7;
  noon.setUTCDate(noon.getUTCDate() - day + 1);
  const monday = noon.toISOString().slice(0, 10);
  noon.setUTCDate(noon.getUTCDate() + 7);
  return { from: localMidnight(monday).toISOString(), to: localMidnight(noon.toISOString().slice(0, 10)).toISOString() };
}

export function monthRange(value = new Date()) {
  const date = dateInEvaOrbit(value);
  const first = `${date.slice(0, 7)}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from: localMidnight(first).toISOString(), to: localMidnight(next.toISOString().slice(0, 10)).toISOString() };
}
