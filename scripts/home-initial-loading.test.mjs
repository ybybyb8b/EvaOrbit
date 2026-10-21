import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function fixture(failure) {
  const calls = [];
  let release, releaseMedication;
  const prepared = new Promise(resolve => { release = resolve; });
  const medicationPrepared = new Promise(resolve => { releaseMedication = resolve; });
  const jsx = (type, props) => ({ type, props });
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "./home.module.css": { default: {} },
    "@/lib/time": { EVAORBIT_TIME_ZONE: "Asia/Shanghai", dateInEvaOrbit: () => "2026-10-21" },
    "@/lib/services/evaorbit": { getUiPreferences: async () => ({ uiLanguage: "en" }) },
    "@/lib/services/home-cache-scope": { getHomeCacheScope: async () => "account-a" },
    "@/lib/services/subscription": { catchUpAutomaticSubscriptionPayments: async now => {
      calls.push(["renewals", now]);
      await prepared;
      if (failure) throw failure;
    } },
    "@/lib/services/period-medication-reminder": { reconcilePeriodMedicationReminders: async now => {
      calls.push(["medication", now]);
      await medicationPrepared;
    } },
    "@/lib/services/home-day": { getHomeDayOverview: async (date, options) => {
      calls.push(["day", date, options]); return { date };
    } },
    "@/lib/services/timeline": { getTimelineMonthSummary: async (month, options) => {
      calls.push(["month", month, options]); return { month };
    } },
    "@/lib/services/reminder": { getDueReminders: async (limit, now, options) => {
      calls.push(["due", limit, now, options]); return [{ id: 1 }];
    } },
    "@/components/home-page-view": { HomePageView: "home" },
    "@/components/due-reminders": { DueReminders: "due" },
    "./home-calendar-timeline": { HomeCalendarTimeline: "calendar" },
  };
  const loaded = {};
  const code = ts.transpileModule(readFileSync("src/app/page.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", code)(name => {
    assert.ok(imports[name], `Unexpected import: ${name}`);
    return imports[name];
  }, loaded);
  return { render: loaded.default, calls, release, releaseMedication };
}

test("Home prepares renewals and medication once before snapshot reads, preserving all initial content", async () => {
  const f = fixture();
  const result = f.render();
  assert.deepEqual(f.calls.map(call => call[0]), ["renewals"]);
  f.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls.map(call => call[0]), ["renewals", "day", "month", "medication"]);
  f.releaseMedication();
  const tree = await result;
  const now = f.calls[0][1];
  assert.deepEqual(f.calls, [
    ["renewals", now],
    ["day", "2026-10-21", { readOnly: true }],
    ["month", "2026-10", { readOnly: true }],
    ["medication", now],
    ["due", 50, now, { readOnly: true }],
  ]);
  const due = tree.props.children.find(node => node.type === "due");
  const calendar = tree.props.children.find(node => node.type === "section").props.children;
  assert.deepEqual(due.props.items, [{ id: 1 }]);
  assert.equal(calendar.props.language, "en");
  assert.equal(calendar.props.cacheScope, "account-a");
  assert.deepEqual(calendar.props.initialDay, { date: "2026-10-21" });
  assert.deepEqual(calendar.props.initialSummary, { month: "2026-10" });
});

test("failed Home preparation does not silently return stale or empty snapshot data", async () => {
  const failure = new Error("Renewal preparation failed");
  const f = fixture(failure);
  const result = f.render();
  f.release();
  f.releaseMedication();
  await assert.rejects(result, error => error === failure);
  assert.deepEqual(f.calls.map(call => call[0]), ["renewals"]);
});
