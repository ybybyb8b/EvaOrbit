import type { SubscriptionIntervalUnit, SubscriptionPayment } from "./types";

export function nextSubscriptionRenewal(date: string, value: number, unit: SubscriptionIntervalUnit) {
  const [year, month, day] = date.split("-").map(Number);
  if (unit === "day" || unit === "week") {
    const next = new Date(Date.UTC(year, month - 1, day + value * (unit === "week" ? 7 : 1), 12));
    return next.toISOString().slice(0, 10);
  }
  const monthOffset = value * (unit === "year" ? 12 : 1);
  const targetMonth = month - 1 + monthOffset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay), 12)).toISOString().slice(0, 10);
}

export function subscriptionTotal(payments: SubscriptionPayment[], currency: string) {
  return payments.filter((payment) => payment.currency === currency).reduce((sum, payment) => sum + payment.amountMinor, 0);
}
