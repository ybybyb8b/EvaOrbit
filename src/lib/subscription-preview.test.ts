import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionBrand, subscriptionPreviewStats } from "./subscription-preview.ts";
import type { Subscription, SubscriptionPayment } from "./types";

test("brand accents use known marks and preserve the theme fallback for unknown names", () => {
  assert.equal(subscriptionBrand(" ChatGPT Plus ")?.icon, "/icons/subscriptions/openai.svg");
  assert.equal(subscriptionBrand("Apple Music")?.color, "#FA243C");
  assert.equal(subscriptionBrand("网易云音乐黑胶")?.color, "#D43C33");
  assert.equal(subscriptionBrand("Apple TV"), null);
  assert.equal(subscriptionBrand("Unknown subscription"), null);
});

test("preview separates currencies, actual history and remaining calendar renewals", () => {
  const item = (id: number, overrides: Partial<Subscription> = {}) => ({ id, name: `Subscription ${id}`, status: "active", currentAmountMinor: 1000, currency: "CNY", nextRenewalOn: "2026-10-16", startedOn: "2026-01-01", billingIntervalValue: 1, billingIntervalUnit: "month", ...overrides }) as Subscription;
  const payment = (subscriptionId: number, paidOn: string, currency: string, amountMinor: number, scheduledFor = paidOn) => ({ subscriptionId, paidOn, currency, amountMinor, scheduledFor }) as SubscriptionPayment;
  const stats = subscriptionPreviewStats([
    item(1), item(2, { currency: "USD", currentAmountMinor: 1999 }), item(3, { status: "paused" }),
    item(4, { billingIntervalUnit: "year", nextRenewalOn: "2027-01-01" }),
    item(5, { billingIntervalUnit: "week", nextRenewalOn: "2026-10-17", autoRenew: false }),
    item(6, { nextRenewalOn: "2026-10-20" }),
  ], [payment(1, "2026-10-01", "CNY", 800), payment(2, "2026-09-01", "USD", 1800), payment(3, "2026-10-05", "CNY", 500), payment(6, "2026-10-09", "CNY", 1000, "2026-10-20"), payment(1, "2026-11-01", "CNY", 900)], "2026-10-10");
  assert.deepEqual(stats.months, ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(stats.actual["2026-10"], { CNY: 2300 });
  assert.deepEqual(stats.expected, { CNY: 6300, USD: 1999 });
  assert.equal(stats.breakdown("2026-09", "USD")[0].amount, 1800);
  assert.equal(stats.breakdown("2026-10", "USD").length, 0);
});

test("preview handles year boundaries, month-end clamping and empty data", () => {
  const item = { id: 1, name: "Daily", status: "active", currency: "CNY", currentAmountMinor: 100, startedOn: "2025-12-31", nextRenewalOn: "2025-12-31", billingIntervalValue: 1, billingIntervalUnit: "month" } as Subscription;
  const stats = subscriptionPreviewStats([item], [], "2026-01-01");
  assert.equal(stats.months[0], "2025-08");
  assert.equal(stats.expected.CNY, 100);
  assert.deepEqual(subscriptionPreviewStats([], [], "2026-01-01").expected, {});
});
