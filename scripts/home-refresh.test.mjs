import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { journalDraftChanged, journalPreviewEntries } from "../src/lib/journal-draft.ts";
import { shiftDate } from "../src/lib/time.ts";

function fixture(local = true) {
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
    "@/lib/home-style": { useHomeStyle: () => "classic" },
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/business-request-context": {useBusinessRequest:()=>async()=>{throw new TypeError("Form write failed");}},
    "@/components/form-sheet": { FormSheet: "sheet" },
    "@/components/error-notice": { ErrorNotice: "error-notice" },
    "@/lib/journal-draft": { journalDraftChanged, journalPreviewEntries },
    "@/lib/journal-emotions": { journalEmotions: [], journalMoodLabel: () => null },
    "@/lib/timeline": { periodDayForDate: () => null },
    "@/lib/time": { EVAORBIT_TIME_ZONE: "Asia/Shanghai", shiftDate },
    "@/lib/home-day": { homeActivitySentence: () => null },
    "@/lib/home-cache": { readHomeSnapshot: async (_, url, signal) => {
      requests.push({ url, signal });
      return read(url, signal);
    } },
  };
  imports["@/lib/native-haptics"] = {playNativeHaptic:()=>{}};
  const loaded = {};
  const code = ts.transpileModule(readFileSync("src/components/home-calendar-timeline.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", "fetch", code)(name => imports[name] ?? {}, loaded, async () => { throw new TypeError("Form write failed"); });
  function render() { cursor = 0; tree = loaded.HomeCalendarTimeline({ initialDay: day, initialSummary: summary, language: "en", cacheScope: "test", dataSource: local ? {read:imports["@/lib/home-cache"].readHomeSnapshot} : undefined }); }
  function nodes(node = tree) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(child => nodes(child ?? null)) : [node, ...nodes(node.props?.children ?? null)]; }
  function succeed() { read = async url => url.startsWith("/api/home-day") ? {...day,date:new URL(url,"https://eo.test").searchParams.get("date")} : {...summary,month:new URL(url,"https://eo.test").searchParams.get("month")}; }
  render(); succeed();
  return { render, nodes, requests, refresh: () => refresh(), succeed, read: fn => { read = fn; },
    alerts: () => nodes().filter(node => node.props.role === "alert").map(node => node.props.children),
  };
}

test("cache revision cancellation does not show a Home sync error even when its signal is not aborted", async () => {
  const f = fixture();
  f.read(async () => { throw new DOMException("Home data changed", "AbortError"); });
  await f.refresh(); f.render();
  assert.ok(f.requests.every(request => !request.signal.aborted), "revision changes cancel reads without aborting the controller");
  assert.deepEqual(f.alerts(), []);
});

test("real refresh failures remain visible until a successful refresh, without erasing editor errors or drafts", async () => {
  const f = fixture();
  f.read(async () => { throw new TypeError("Network unavailable"); });
  await f.refresh(); f.render();
  assert.deepEqual(f.alerts(), ["Synced data could not refresh. Please try again."]);
  f.succeed(); await f.refresh(); f.render();
  assert.deepEqual(f.alerts(), []);
  f.nodes().find(node => node.props.className === "home-journal-add").props.onClick(); f.render();
  f.nodes().find(node => node.type === "textarea").props.onChange({ target: { value: "Unsaved note" } }); f.render();
  // A failed form write has its own error; a background success must not hide it.
  await f.nodes().find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); f.render();
  const errors = f.alerts();
  assert.ok(errors.some(message => message.includes("Could not save")));
  await f.refresh(); f.render();
  assert.deepEqual(f.alerts(), errors);
  assert.equal(f.nodes().find(node => node.type === "textarea").props.value, "Unsaved note");
});

test("a superseded refresh cannot overwrite a newer success with an error", async () => {
  const f = fixture();
  let reject;
  f.read(() => new Promise((_, fail) => { reject ??= fail; }));
  const pending = f.refresh();
  f.succeed(); await f.refresh(); f.render();
  assert.equal(f.requests[0].signal.aborted, true);
  reject(new Error("Late failure")); await pending; f.render();
  assert.deepEqual(f.alerts(), []);
});

test("Web Home reuses the server day and month without duplicate API reads", async () => {
  const f = fixture(false);
  await f.refresh(); f.render();
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.alerts(), []);
});

test("Web Home still refreshes a historical selection without reloading the server month", async () => {
  const f = fixture(false);
  f.nodes().find(node => node.props["aria-label"]?.startsWith("2026-10-16")).props.onClick();
  await new Promise(resolve => setImmediate(resolve)); f.render();
  f.requests.length = 0;
  await f.refresh(); f.render();
  assert.deepEqual(f.requests.map(request => request.url), ["/api/home-day?date=2026-10-16"]);
  assert.deepEqual(f.alerts(), []);
});


test("an aborted historical refresh cannot overwrite a newer success with an error", async () => {
  const f = fixture(false);
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
