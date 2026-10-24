import type { Subscription, SubscriptionPayment } from "./types";

/** Next known dates only: never fabricate charges or advance overdue plans. */
export function subscriptionTimeline(items: Subscription[], payments: SubscriptionPayment[], today: string) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  const through = end.toISOString().slice(0, 10);
  const byId = new Map(items.map(item => [item.id, item]));
  const upcoming = items.filter(item => item.status === "active" && item.nextRenewalOn <= through)
    .sort((a, b) => a.nextRenewalOn.localeCompare(b.nextRenewalOn) || a.id - b.id);
  const recorded = payments.filter(payment => payment.paidOn <= today && byId.has(payment.subscriptionId))
    .map(payment => ({ ...payment, subscription: byId.get(payment.subscriptionId)! }))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id - a.id);
  return { upcoming, recorded };
}
