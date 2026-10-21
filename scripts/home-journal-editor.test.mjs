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

test("read-only Home retains historical notes and refuses forced form submission", async () => {
  const f = fixture(true);
  assert(f.byClass("home-calendar-today"), "An older offline snapshot must not be labeled as today");
  f.byClass("home-journal-preview-list").props.children[1].props.onClick(); f.render();
  assert.equal(f.sheet().props.title, "查看短记");
  assert.equal(f.sheet().props.submitLabel, undefined);
  assert.equal(f.find(node => node.type === "textarea").props.disabled, true);
  await f.byClass("home-journal-form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.requests, []);
});

test("existing notes edit in isolation, preserve failed drafts and PATCH the selected ID", async () => {
  const f = fixture();
  f.byClass("home-journal-preview-list").props.children[1].props.onClick(); f.render();
  assert.equal(f.sheet().props.title, "编辑短记");
  assert.equal(f.sheet().props.dirty, false);
  assert.equal(f.sheet().props.submitDisabled, true);
  assert.equal(f.byClass("home-journal-entries"), undefined);
  assert.equal(f.byText("改写新记录"), undefined);
  const input = () => f.find(node => node.type === "textarea");
  assert.equal(input().props.value, f.entries[1].content);
  input().props.onChange({ target: { value: "修改后的内容" } }); f.render();
  assert.equal(f.sheet().props.dirty, true);
  f.setFail(true);
  await f.byClass("home-journal-form").props.onSubmit({ preventDefault() {} }); f.render();
  assert.equal(input().props.value, "修改后的内容");
  assert.equal(f.sheet().props.dirty, true);
  f.setFail(false);
  await f.byClass("home-journal-form").props.onSubmit({ preventDefault() {} }); f.render();
  assert.equal(f.sheet(), undefined);
  assert.equal(f.requests.at(-1).url, "/api/daily-journal/2");
  assert.equal(f.requests.at(-1).method, "PATCH");
  assert.deepEqual(JSON.parse(f.requests.at(-1).body), { content: "修改后的内容", moodScore: null, emotion: "neutral", energyLevel: 2, hasFullDiary: true });
});

test("add opens a blank form and POSTs; history shows only a list before selecting an editor", async () => {
  const f = fixture();
  f.byClass("home-journal-add").props.onClick(); f.render();
  assert.equal(f.sheet().props.title, "新增短记");
  assert.equal(f.find(node => node.type === "textarea").props.value, "");
  assert.equal(f.byClass("home-journal-entries"), undefined);
  assert.equal(f.byText("删除这条短记"), undefined);
  f.find(node => node.type === "textarea").props.onChange({ target: { value: "新短记" } }); f.render();
  await f.byClass("home-journal-form").props.onSubmit({ preventDefault() {} }); f.render();
  assert.equal(f.requests.at(-1).method, "POST");
  assert.equal(JSON.parse(f.requests.at(-1).body).date, "2026-10-17");
  f.byClass("home-journal-view-all").props.onClick(); f.render();
  assert.equal(f.sheet().props.title, "当天日记");
  assert.equal(f.sheet().props.submitLabel, undefined);
  assert.equal(f.byClass("home-journal-form"), undefined);
  assert.equal(f.byClass("home-journal-entries").props.children[0].length, 4);
  f.byClass("home-journal-entries").props.children[0][3].props.onClick(); f.render();
  assert.equal(f.sheet().props.title, "编辑短记");
  assert.equal(f.find(node => node.type === "textarea").props.value, f.entries[3].content);
  assert.equal(f.byClass("home-journal-entries"), undefined);
});

test("delete requires confirmation, preserves a failed edit and closes after success", async () => {
  const f = fixture();
  f.byClass("home-journal-preview-list").props.children[0].props.onClick(); f.render();
  f.find(node => node.type === "textarea").props.onChange({ target: { value: "未保存的修改" } }); f.render();
  f.byText("删除这条短记").props.onClick(); f.render();
  assert.equal(f.requests.length, 0);
  assert.equal(f.byClass("home-journal-form").props.inert, true);
  f.byText("继续编辑").props.onClick(); f.render();
  assert.equal(f.byClass("home-journal-form").props.inert, false);
  f.byText("删除这条短记").props.onClick(); f.render();
  f.setFail(true); f.byText("删除记录").props.onClick();
  await new Promise(resolve => setImmediate(resolve)); f.render();
  assert.equal(f.find(node => node.type === "textarea").props.value, "未保存的修改");
  assert.equal(f.sheet().props.dirty, true);
  f.setFail(false); f.byText("删除这条短记").props.onClick(); f.render();
  f.byText("删除记录").props.onClick();
  await new Promise(resolve => setImmediate(resolve)); f.render();
  assert.equal(f.requests.at(-1).method, "DELETE");
  assert.equal(f.requests.at(-1).url, "/api/daily-journal/1");
  assert.equal(f.sheet(), undefined);
});
