import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { trainingTemplate } from "../src/lib/training-plan.ts";
import { trainingSessionTitle } from "../src/lib/training-session.ts";
import { workoutActivityLabel, workoutStatus } from "../src/lib/training-workout.ts";

test("Day capsules only preview; switching requires an explicit action and confirmation", async () => {
  const slots = [], requests = [], confirmations = [];
  let cursor = 0, confirmSwitch = false;
  const jsx = (type, props) => ({ type, props });
  const editor = () => null;
  const plan = { ...trainingTemplate(), version: 1, updatedAt: "" };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef: initial => slots[cursor++] ??= { current: initial },
    useEffect: () => { cursor++; },
  };
  const code = ts.transpileModule(readFileSync("src/app/health/training-section.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = {};
  const earlierWorkout = { id: 99, occurredAt: "2026-10-14T15:50:00Z", bodyParts: ["背"], teacher: "", course: "", durationMinutes: 25, workout: { workout: { activityType: 50, activityName: "traditionalStrengthTraining" } } };
  const request=async(url, options)=>{requests.push({url,...options});if(!options?.method)return {ok:true,json:async()=>[earlierWorkout,{...earlierWorkout,id:100,planCompleted:true}]};const payload=JSON.parse(options.body);return {ok:true,json:async()=>({...plan,currentDayId:payload.currentDayId,version:2})};};
  new Function("require", "exports", "window", "fetch", code)(name => {
    if (name === "react") return react;
    if(name.endsWith("form-preview"))return {useFormPreview:()=>false};
    if(name.endsWith("health-data-context"))return {useHealthData:()=>({read:request})};
    if (name.endsWith("error-notice")) return { ErrorNotice: "error-notice" };
    if (name.endsWith("use-data-refresh")) return { useServerDataState: react.useState, useDataRefresh: () => {} };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.endsWith("locale-controller")) return { useLocale: () => ({ english: false }) };
    if (name.endsWith("bottom-log-core")) return { PageLogAction: "log-action" };
    if (name.endsWith("form-sheet")) return {FormSheet:"form-sheet"};
    if (name.endsWith("disclosure")) return {Disclosure:"disclosure"};
    if (name.endsWith("icons")) return { Icon: "icon" };
    if (name.endsWith("date-time-field")) return { compactDateTimeValue: () => "" };
    if (name.endsWith("time")) return { dateInEvaOrbit: () => "2026-10-15", shiftDate: value => value };
    if (name.endsWith("training-plan-editor")) return { TrainingPlanEditor: "plan-editor" };
    if (name.endsWith("training-session")) return { trainingSessionTitle };
    if (name.endsWith("training-workout")) return { workoutActivityLabel, workoutStatus };
    if (name.endsWith("training-log-editor")) return {
      TrainingLogEditor: editor,
      trainingTypeLabels: Object.fromEntries(["strength", "cardio", "mixed"].map(type => [type, { en: type, zh: type }])),
      trainingBodyPartLabels: Object.fromEntries(["手臂", "核心", "腿", "背", "全身"].map(part => [part, { en: part, zh: part }])),
    };
    throw new Error(name);
  }, loaded, { confirm: message => { confirmations.push(message); return confirmSwitch; } }, async (url, options) => {
    requests.push({ url, ...options });
    const payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ...plan, currentDayId: payload.currentDayId, version: 2 }) };
  });
  const text = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(text).join("") : typeof node === "object" ? text(node.props?.children) : String(node);
  const nodes = node => node == null || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const render = () => { cursor = 0; return nodes(loaded.TrainingSection({ initial: [], initialRecent: [], initialSuggestions: { teachers: [], courses: [], presets: [] }, initialPlan: plan, today: "2026-10-15" })); };
  const button = (tree, name) => tree.find(node => node.type === "button" && text(node) === name);
  let tree = render();
  button(tree, "Day 3").props.onClick(); tree = render();
  assert.equal(requests.length, 0);
  assert.equal(confirmations.length, 0);
  assert.ok(tree.some(node => node.type === "h3" && text(node).includes("Day 3")));
  assert.equal(button(tree, "Day 3").props["aria-pressed"], true);
  assert.equal(button(tree, "Day 1").props["aria-current"], "step");
  assert.equal(button(tree, "完成并记录"), undefined);
  button(tree, "设为待练").props.onClick();
  assert.equal(confirmations.length, 1);
  assert.equal(requests.length, 0, "dismissing confirmation never writes progress");
  confirmSwitch = true;
  button(tree, "设为待练").props.onClick();
  await new Promise(resolve => setImmediate(resolve)); tree = render();
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].body).currentDayId, "day-3");
  assert.equal(button(tree, "Day 3").props["aria-current"], "step");
  assert.equal(button(tree, "设为待练"), undefined);
  button(tree, "完成并记录").props.onClick(); tree = render();
  assert.equal(tree.find(node => node.type === editor).props.planCompletion.plan.currentDayId, "day-3");
  assert.equal(requests.length, 1, "opening the log editor also leaves progress unchanged");
  const originalEditor = tree.find(node => node.type === editor);
  const sessionDraft = { occurredAt: "2026-10-15", notes: "Keep these notes", sessionDetails: { exercises: [{ id: "bridge", completedSets: 2 }], videos: [{ completed: true }] } };
  originalEditor.props.onChooseWorkout(sessionDraft, true); tree = render();
  await tree.find(node => node.type === "input" && node.props.type === "date").props.onChange({ target: { value: "2026-10-14" } });
  await new Promise(resolve => setImmediate(resolve)); tree = render();
  assert.equal(requests.at(-1).url, "/api/health/training?date=2026-10-14");
  const choices = tree.filter(node => node.type === "button" && node.props.className === "training-log-main");
  assert.equal(choices.length, 1); choices[0].props.onClick(); tree = render();
  assert.equal(tree.find(node => node.type === editor).props.record.id, 99);
  assert.equal(tree.find(node => node.type === editor).props.resumeDraft, sessionDraft, "changing Workout preserves the session draft");
  assert.equal(tree.find(node => node.type === editor).props.resumeDirty, true, "closing after changing Workout still protects unsaved work");
  assert.equal(tree.find(node => node.type === editor).props.planCompletion.requestKey, originalEditor.props.planCompletion.requestKey, "changing dates keeps the same completion request");
  assert.equal(requests.filter(request => request.method === "PUT" || request.method === "POST").length, 1, "choosing a previous date only reads; progress waits for save");
});
