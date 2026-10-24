import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionTimeline } from "./subscription-timeline.ts";
import type { Subscription, SubscriptionPayment } from "./types";

test("timeline retains overdue dates, bounds upcoming plans and separates recorded payments", () => {
  const item = (id: number, nextRenewalOn: string, status = "active") => ({ id, name: `Service ${id}`, nextRenewalOn, status }) as Subscription;
  const items = [item(1, "2026-10-15"), item(2, "2026-10-24"), item(3, "2026-11-23"), item(4, "2026-11-24"), item(5, "2026-10-01", "paused"), item(6, "2026-10-02", "ended")];
  const payment = (id: number, subscriptionId: number, paidOn: string) => ({ id, subscriptionId, paidOn, amountMinor: 1000, currency: "USD" }) as SubscriptionPayment;
  const payments = [payment(1, 1, "2026-07-15"), payment(2, 6, "2026-10-01"), payment(3, 2, "2026-11-01"), payment(4, 999, "2026-10-24")];
  const result = subscriptionTimeline(items, payments, "2026-10-24");
  assert.deepEqual(result.upcoming.map(i => i.id), [1, 2, 3]);
  assert.deepEqual(result.recorded.map(p => p.id), [2, 1]);
  assert.equal(result.upcoming[0].nextRenewalOn, "2026-10-15");
  assert.equal(payments.length, 4, "projection must not fabricate or mutate payments");
  assert.deepEqual(subscriptionTimeline([], [], "2026-12-31"), { upcoming: [], recorded: [] });
});
