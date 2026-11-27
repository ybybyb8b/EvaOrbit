import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { journalDraftChanged, journalPreviewEntries } from "../src/lib/journal-draft.ts";
import { shiftDate } from "../src/lib/time.ts";

function fixture(readOnly = false) {
  const hooks = [], requests = [];
  let cursor = 0, tree, fail = false;
  const date = "2026-10-17";
  const entries = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, date, content: `短记 ${i + 1}`, moodScore: null, emotion: "neutral", energyLevel: 2, hasFullDiary: true }));
  const day = { date, journal: entries, events: [], tasks: [], meals: [], activities: [], activityRecords: [], sleepSummary: {}, calendarInterpretation: { categories: [], rules: [] } };
  const summary = { month: "2026-10", days: {}, periods: [] };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useEffect() {}, useEffectEvent: fn => fn, useMemo: fn => fn(),
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/business-request-context": {useBusinessRequest:()=>async(url,options)=>{requests.push({url,...options});return {ok:!fail};}},
    "@/components/form-sheet": { FormSheet: "sheet" },
    "@/components/error-notice": { ErrorNotice: "error-notice" },
    "@/lib/journal-draft": { journalDraftChanged, journalPreviewEntries },
    "@/lib/journal-emotions": { journalEmotions: [], journalMoodLabel: () => null },
    "@/lib/timeline": { periodDayForDate: () => null },
    "@/lib/time": { EVAORBIT_TIME_ZONE: "Asia/Shanghai", shiftDate, dateInEvaOrbit: () => "2026-10-19" },
    "@/lib/home-day": { homeActivitySentence: () => null },
    "@/lib/home-cache": { readHomeSnapshot: async (_, url) => url.startsWith("/api/home-day") ? day : summary },
  };
  const loaded = {};
  const code = ts.transpileModule(readFileSync("src/components/home-calendar-timeline.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", "window", "fetch", code)(name => imports[name] ?? {}, loaded, { requestAnimationFrame: fn => fn() }, async (url, options) => {
    requests.push({ url, ...options }); return { ok: !fail };
  });
  function render() { cursor = 0; tree = loaded.HomeCalendarTimeline({ initialDay: day, initialSummary: summary, language: "zh-CN", cacheScope: "test", readOnly }); }
  function nodes(node = tree) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(child => nodes(child ?? null)) : [node, ...nodes(node.props?.children ?? null)]; }
  function find(predicate) { return nodes().find(predicate); }
  const byClass = value => find(node => node.props.className === value);
  const byText = value => find(node => node.type === "button" && (node.props.children === value || Array.isArray(node.props.children) && node.props.children.includes(value)));
  const sheet = () => find(node => node.type === "sheet");
  render();
  return { render, nodes, find, byClass, byText, sheet, requests, entries, setFail: value => { fail = value; } };
}

test("Home hides retired summary panels while retaining the original day payload", () => {
  for(const readOnly of [false,true]) {
    const f=fixture(readOnly);
    for(const name of ["home-sleep-pane","home-journal-pane","home-journal-add","home-time-summary","home-meal-list"]) assert.equal(f.byClass(name),undefined);
    assert.equal(f.entries.length,4);
    assert.deepEqual(f.requests,[]);
    assert(f.byClass("home-day-timeline"));
    if(readOnly) assert(f.byClass("home-calendar-today"));
  }
});
