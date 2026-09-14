import assert from "node:assert/strict";
import test from "node:test";
import { nextSubscriptionRenewal, subscriptionTotal } from "./subscriptions.ts";

test("subscription renewal clamps calendar months", () => {
  assert.equal(nextSubscriptionRenewal("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(nextSubscriptionRenewal("2024-02-29", 1, "year"), "2025-02-28");
});

test("cumulative spend only includes actual payments in the current currency", () => {
  const payment = (amountMinor:number,currency:string) => ({id:1,subscriptionId:1,scheduledFor:"2026-09-01",paidOn:"2026-09-01",amountMinor,currency,note:"",createdAt:"2026-09-01T00:00:00Z"});
  assert.equal(subscriptionTotal([payment(1200,"CNY"), payment(800,"CNY"), payment(500,"USD")], "CNY"), 2000);
});
