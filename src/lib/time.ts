export const EVAORBIT_TIME_ZONE = process.env.EVAORBIT_TIME_ZONE || "Asia/Shanghai";

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

export function weekRange(value = new Date()) {
  const date = dateInEvaOrbit(value);
  const noon = new Date(`${date}T12:00:00Z`);
  const day = noon.getUTCDay() || 7;
  noon.setUTCDate(noon.getUTCDate() - day + 1);
  const monday = noon.toISOString().slice(0, 10);
  noon.setUTCDate(noon.getUTCDate() + 7);
  return { from: localMidnight(monday).toISOString(), to: localMidnight(noon.toISOString().slice(0, 10)).toISOString() };
}
