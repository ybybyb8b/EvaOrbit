import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_MODULE_IDS, normalizeHomeModuleOrder } from "./home-modules.ts";

test("normalizes a partial home module order without losing new modules", () => {
  const result = normalizeHomeModuleOrder(["cats", "food", "cats", "unknown"]);
  assert.deepEqual(result.slice(0, 2), ["cats", "food"]);
  assert.equal(result.length, HOME_MODULE_IDS.length);
  assert.deepEqual(new Set(result), new Set(HOME_MODULE_IDS));
});

test("drops the legacy Settings entry from saved Home orders", () => {
  const result = normalizeHomeModuleOrder(["settings", "eva", "inbox"]);
  assert.equal((result as readonly string[]).includes("settings"), false);
  assert.deepEqual(result.slice(0, 2), ["eva", "inbox"]);
});

test("Home keeps quick capture in the universal Log without favorite shortcuts", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const calendar = readFileSync(new URL("../app/home-calendar-timeline.tsx", import.meta.url), "utf8");
  const quickLog = readFileSync(new URL("../app/home-quick-log.tsx", import.meta.url), "utf8");
  const healthQuickLog = readFileSync(new URL("../app/health/health-quick-log.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /HomeDestinations|home-destinations/);
  assert.match(calendar, /<HomeQuickLog/);
  assert.match(quickLog, /\.\.\.HEALTH_QUICK_LOGS/);
  for (const kind of ["training", "weight", "health-record"]) assert.match(healthQuickLog, new RegExp(`kind: "${kind}"`));
  assert.match(healthQuickLog, /TrainingLogEditor/);
  assert.match(healthQuickLog, /WeightEditor/);
  assert.match(healthQuickLog, /HealthRecordEditor/);
  assert.match(healthQuickLog, /kind: "training", icon: Dumbbell/);
  assert.match(healthQuickLog, /kind: "weight", icon: Weight/);
  assert.match(healthQuickLog, /kind: "health-record", icon: Health/);
  assert.match(quickLog, /from "reicon-react"/);
  assert.match(quickLog, /icon: LogIcon/);
  assert.match(quickLog, /<LogIcon className="home-quick-log-icon"/);
  assert.equal(healthQuickLog.match(/initialDate=\{initialDate\}/g)?.length, 3);
  assert.match(healthQuickLog, /\/api\/health\/weight\?limit=1/);
  assert.doesNotMatch(healthQuickLog, /AppleHealthSection|WeightSettingsSheet|DailyEnergyCard/);
});
