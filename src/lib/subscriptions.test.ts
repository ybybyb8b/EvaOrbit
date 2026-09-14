import assert from "node:assert/strict";
import test from "node:test";
import { automaticSubscriptionRenewalsThrough, nextSubscriptionRenewal, subscriptionSpendByCurrency, subscriptionTotal } from "./subscriptions.ts";

test("subscription renewal clamps calendar months", () => {
  assert.equal(nextSubscriptionRenewal("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(nextSubscriptionRenewal("2024-02-29", 1, "year"), "2025-02-28");
});

test("automatic renewals catch up every due billing date and exclude manual or paused subscriptions", () => {
  const subscription = { status: "active" as const, autoRenew: true, nextRenewalOn: "2026-01-31", billingIntervalValue: 1, billingIntervalUnit: "month" as const };
  assert.deepEqual(automaticSubscriptionRenewalsThrough(subscription, "2026-04-30"), ["2026-01-31", "2026-02-28", "2026-03-28", "2026-04-28"]);
  assert.deepEqual(automaticSubscriptionRenewalsThrough({ ...subscription, autoRenew: false }, "2026-04-30"), []);
  assert.deepEqual(automaticSubscriptionRenewalsThrough({ ...subscription, status: "paused" }, "2026-04-30"), []);
});

test("cumulative spend only includes payments in the current currency", () => {
  const payment = (amountMinor:number,currency:string) => ({id:1,subscriptionId:1,scheduledFor:"2026-09-01",paidOn:"2026-09-01",amountMinor,currency,note:"",createdAt:"2026-09-01T00:00:00Z"});
  assert.equal(subscriptionTotal([payment(1200,"CNY"), payment(800,"CNY"), payment(500,"USD")], "CNY"), 2000);
});

test("cumulative spend remains accurate when payment currencies change", () => {
  const payment = (amountMinor:number,currency:string) => ({id:1,subscriptionId:1,scheduledFor:"2026-09-01",paidOn:"2026-09-01",amountMinor,currency,note:"",createdAt:"2026-09-01T00:00:00Z"});
  assert.deepEqual(subscriptionSpendByCurrency([payment(1200,"CNY"),payment(800,"CNY"),payment(500,"USD")]),{CNY:2000,USD:500});
});
