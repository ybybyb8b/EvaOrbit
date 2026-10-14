import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("daily and monthly Timeline start independent subscription, settings and period reads before slow food reads finish", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-home-loading-"));
  try {
    const program = String.raw`
      import assert from "node:assert/strict";
      import { getRepository } from "./src/lib/repositories/index.ts";
      import { getDailyTimelineOverview, getTimelineMonthSummary } from "./src/lib/services/timeline.ts";
      import { dateInEvaOrbit, shiftDate } from "./src/lib/time.ts";
      const repository = await getRepository(), date = dateInEvaOrbit();
      const original = {};
      for (const key of ["listFoodLogs", "listSubscriptions", "listSubscriptionPayments", "getCalendarInterpretation", "listMenstrualPeriods", "listMenstrualFlowRecords"]) original[key] = repository[key].bind(repository);
      let release, seen, foodFinished, readyResolve, monthlyRun;
      const mark = key => { seen.add(key); if (release && seen.has("payments") && seen.has("settings") && (!monthlyRun || seen.has("periodFlows"))) readyResolve(); };
      repository.listFoodLogs = async () => { await new Promise(resolve => { release = resolve; mark("food"); }); foodFinished = true; return []; };
      repository.listSubscriptions = async input => {
        if (input?.status === "active") { seen.add("catchUp"); return []; }
        assert.ok(seen.has("catchUp"), "subscription reads must follow renewal catch-up");
        return [{ id: 98765, name: "Loading test", currency: "CNY", status: "active", autoRenew: false }];
      };
      repository.listSubscriptionPayments = async () => {
        assert.equal(foodFinished, false); mark("payments");
        return [date, shiftDate(date, -40), shiftDate(date, 40)].map((paidOn, index) => ({ id: index + 1, subscriptionId: 98765, scheduledFor: paidOn, paidOn, amountMinor: 100, currency: "CNY", note: "", createdAt: paidOn + "T12:00:00Z" }));
      };
      repository.getCalendarInterpretation = async () => { assert.equal(foodFinished, false); mark("settings"); return original.getCalendarInterpretation(); };
      repository.listMenstrualPeriods = async () => { assert.equal(foodFinished, false); mark("periods"); return [{ id: 98765, startedOn: date, endedOn: null, notes: "" }]; };
      repository.listMenstrualFlowRecords = async input => {
        if (input?.periodId) { assert.equal(foodFinished, false); mark("periodFlows"); return []; }
        return original.listMenstrualFlowRecords(input);
      };
      try {
        for (const monthly of [false, true]) {
          release = undefined; seen = new Set(); foodFinished = false; monthlyRun = monthly;
          const ready = new Promise(resolve => { readyResolve = resolve; });
          const request = monthly ? getTimelineMonthSummary(date.slice(0, 7)) : getDailyTimelineOverview(date);
          let timeout;
          try {
            await Promise.race([ready, new Promise(resolve => { timeout = setTimeout(resolve, 3000); })]);
            assert.ok(release, "slow food read started");
            assert.ok(seen.has("payments"), "payments started independently of food");
            assert.ok(seen.has("settings"), "interpretation started independently of food");
            if (monthly) { assert.ok(seen.has("periods")); assert.ok(seen.has("periodFlows")); }
          } finally { clearTimeout(timeout); release?.(); }
          const result = await request;
          if (monthly) { assert.equal(result.month, date.slice(0, 7)); assert.ok(result.days[date]); assert.equal(result.periods.length, 1); }
          else { const payments = result.events.filter(item => item.sourceType === "subscription"); assert.equal(payments.length, 1); assert.equal(payments[0].sourceId, 1); }
        }
      } finally { Object.assign(repository, original); }
    `;
    const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "home.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
