import type { Subscription, SubscriptionPayment } from "./types";
import { nextSubscriptionRenewal } from "./subscriptions.ts";

// Local brand marks and their published palette; no third-party requests while browsing.
const brands = [
  { match: /^(chatgpt|openai)(?:$|[\s+·(（-])/i, icon: "openai", color: "#000000" },
  { match: /^(apple\s*music|苹果音乐)/i, icon: "applemusic", color: "#FA243C" },
  { match: /^(网易云音乐|netease\s*cloud\s*music)/i, icon: "neteasecloudmusic", color: "#D43C33" },
  { match: /^spotify(?:$|[\s+·(（-])/i, icon: "spotify", color: "#1ED760" },
  { match: /^netflix(?:$|[\s+·(（-])/i, icon: "netflix", color: "#E50914" },
  { match: /^youtube(?:$|[\s+·(（-])/i, icon: "youtube", color: "#FF0000" },
  { match: /^notion(?:$|[\s+·(（-])/i, icon: "notion", color: "#000000" },
  { match: /^icloud(?:$|[\s+·(（-])/i, icon: "icloud", color: "#3693F3" },
  { match: /^adobe(?:$|[\s+·(（-])/i, icon: "adobe", color: "#FF0000" },
  { match: /^github(?:$|[\s+·(（-])/i, icon: "github", color: "#181717" },
];

export function subscriptionBrand(name: string) {
  const brand = brands.find(brand => brand.match.test(name.trim()));
  return brand ? { icon: `/icons/subscriptions/${brand.icon}.svg`, color: brand.color } : null;
}

/** Read-only projections; historical totals always come from recorded payments. */
export function subscriptionPreviewStats(items: Subscription[], payments: SubscriptionPayment[], today: string) {
  const [year, month] = today.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, month - 6 + index, 1, 12)).toISOString().slice(0, 7));
  const currentMonth = today.slice(0, 7);
  const monthEnd = new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
  const actual: Record<string, Record<string, number>> = Object.fromEntries(months.map(key => [key, {}]));
  const recorded = payments.filter(payment => payment.paidOn <= today);
  for (const payment of recorded) {
    const totals = actual[payment.paidOn.slice(0, 7)];
    if (totals) totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amountMinor;
  }
  const remaining: Record<string, number> = {};
  const booked = new Set(payments.map(payment => `${payment.subscriptionId}:${payment.scheduledFor}`));
  for (const item of items.filter(item => item.status === "active")) {
    // Manual renewals are also scheduled costs. Overdue dates stay overdue, not moved into this month.
    for (let due = item.nextRenewalOn; due <= monthEnd; due = nextSubscriptionRenewal(due, item.billingIntervalValue, item.billingIntervalUnit)) {
      if (due >= today && due >= item.startedOn && !booked.has(`${item.id}:${due}`)) remaining[item.currency] = (remaining[item.currency] ?? 0) + item.currentAmountMinor;
    }
  }
  const currencies = [...new Set([...items.map(item => item.currency), ...payments.map(payment => payment.currency)])].sort();
  const expected = Object.fromEntries(currencies.map(currency => [currency, (actual[currentMonth][currency] ?? 0) + (remaining[currency] ?? 0)]));
  const breakdown = (selectedMonth: string, currency: string) => items.map(item => ({
    id: item.id, name: item.name,
    amount: recorded.filter(payment => payment.subscriptionId === item.id && payment.currency === currency && payment.paidOn.startsWith(selectedMonth)).reduce((total, payment) => total + payment.amountMinor, 0),
  })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
  return { months, currentMonth, actual, expected, remaining, currencies, breakdown };
}
