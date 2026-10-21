import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { journalDraftChanged, journalPreviewEntries } from "../src/lib/journal-draft.ts";
import { shiftDate } from "../src/lib/time.ts";

function fixture() {
  const hooks = [], requests = [];
  let cursor = 0, tree, refresh, read;
  const date = "2026-10-17", summary = { month: "2026-10", days: {}, periods: [] };
  const day = { date, journal: [], events: [], tasks: [], meals: [], activities: [], activityRecords: [], sleepSummary: {}, calendarInterpretation: { categories: [], rules: [] } };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useEffect() {}, useMemo: fn => fn(), useEffectEvent: fn => { refresh = fn; return fn; },
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/form-sheet": { FormSheet: "sheet" },
    "@/components/error-notice": { ErrorNotice: "error-notice" },
    "@/lib/journal-draft": { journalDraftChanged, journalPreviewEntries },
    "@/lib/journal-emotions": { journalEmotions: [], journalMoodLabel: () => null },
    "@/lib/timeline": { periodDayForDate: () => null },
    "@/lib/time": { EVAORBIT_TIME_ZONE: "Asia/Shanghai", shiftDate },
    "@/lib/native-haptics": { playNativeHaptic: () => {} },
    "@/lib/home-day": { homeActivitySentence: () => null },
    "@/lib/home-cache": { readHomeSnapshot: async (_, url, signal) => {
      requests.push({ url, signal });
      return read(url, signal);
    } },
  };
  const loaded = {};
  const code = ts.transpileModule(readFileSync("src/app/home-calendar-timeline.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", "fetch", code)(name => imports[name] ?? {}, loaded, async () => { throw new TypeError("Form write failed"); });
  function render() { cursor = 0; tree = loaded.HomeCalendarTimeline({ initialDay: day, initialSummary: summary, language: "en", cacheScope: "test" }); }
  function nodes(node = tree) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(child => nodes(child ?? null)) : [node, ...nodes(node.props?.children ?? null)]; }
  function succeed() { read = async url => url.startsWith("/api/home-day") ? { ...day, date: new URL(url, "https://eo.test").searchParams.get("date") } : { ...summary, month: new URL(url, "https://eo.test").searchParams.get("month") }; }
  render(); succeed();
  return { render, nodes, requests, refresh: () => refresh(), succeed, read: fn => { read = fn; },
    alerts: () => nodes().filter(node => node.props.role === "alert").map(node => node.props.children),
  };
}

test("Web Home reuses the server day and month without duplicate API reads", async () => {
  const f = fixture();
  await f.refresh(); f.render();
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.alerts(), []);
});

test("Web Home still refreshes a historical selection without reloading the server month", async () => {
  const f = fixture();
  f.nodes().find(node => node.props["aria-label"]?.startsWith("2026-10-16")).props.onClick();
  await new Promise(resolve => setImmediate(resolve)); f.render();
  f.requests.length = 0;
  await f.refresh(); f.render();
  assert.deepEqual(f.requests.map(request => request.url), ["/api/home-day?date=2026-10-16"]);
  assert.deepEqual(f.alerts(), []);
});


test("an aborted historical refresh cannot overwrite a newer success with an error", async () => {
  const f = fixture();
  f.nodes().find(node => node.props["aria-label"]?.startsWith("2026-10-16")).props.onClick();
  await new Promise(resolve => setImmediate(resolve)); f.render();
  f.requests.length = 0;
  let reject;
  f.read(() => new Promise((_, fail) => { reject = fail; }));
  const pending = f.refresh();
  f.succeed(); await f.refresh(); f.render();
  assert.equal(f.requests[0].signal.aborted, true);
  reject(new Error("Late failure")); await pending; f.render();
  assert.deepEqual(f.alerts(), []);
});
