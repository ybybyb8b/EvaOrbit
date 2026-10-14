import assert from "node:assert/strict";
import test from "node:test";
import { healthPeriodHistoryFrom } from "./health-period-range.ts";

test("health history uses six calendar months and clamps the target month end", () => {
  assert.equal(healthPeriodHistoryFrom("2026-10-14"), "2026-04-14");
  assert.equal(healthPeriodHistoryFrom("2026-08-31"), "2026-02-28");
  assert.equal(healthPeriodHistoryFrom("2024-08-31"), "2024-02-29");
  assert.equal(healthPeriodHistoryFrom("2026-03-31"), "2025-09-30");
});
