import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { shiftDate } from "./time.ts";

test("shared date shifts preserve Food, Home and Tracker calendar boundaries across device zones", () => {
  const cases = [["2024-02-28", 1, "2024-02-29"], ["2024-03-01", -1, "2024-02-29"], ["2026-12-31", 1, "2027-01-01"], ["2026-01-01", -1, "2025-12-31"], ["2026-03-08", 1, "2026-03-09"], ["2026-11-01", -1, "2026-10-31"], ["2026-10-18", 0, "2026-10-18"]] as const;
  for (const [date, days, expected] of cases) assert.equal(shiftDate(date, days), expected);
  const code = `import { shiftDate } from './src/lib/time.ts'; console.log(JSON.stringify(${JSON.stringify(cases)}.map(([date, days]) => shiftDate(date, days))));`;
  for (const TZ of ["UTC", "America/Los_Angeles", "Asia/Shanghai"]) {
    const actual = execFileSync(process.execPath, ["--input-type=module", "--eval", code], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.deepEqual(JSON.parse(actual), cases.map(item => item[2]));
  }
});
