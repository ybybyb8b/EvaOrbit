export function healthPeriodHistoryFrom(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 7, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
