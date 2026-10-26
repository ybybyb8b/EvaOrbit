import assert from "node:assert/strict";
import test from "node:test";
import { parseNewTrainingLog, parseTrainingExercises, parseTrainingLogPatch, parseTrainingSessionDetails } from "./validation.ts";
import { adjustTrainingExercise, trainingSessionTitle, exerciseTarget, exerciseTargetParts, trainingExerciseSuggestions, reuseTrainingExercises } from "./training-session.ts";
import { trainingDayDraft, trainingTemplate, parseTrainingPlanWrite } from "./training-plan.ts";
import type { TrainingExerciseLog } from "./types.ts";
import type { TrainingLog } from "./types.ts";
import { createResourceRegistry, type ResourceRegistryOperations } from "./mcp/resource-registry.ts";

const movement = { id: "row", name: "划船", sets: 3, target: "12 次" };

test("side selection keeps legacy targets and round trips through the existing session schema", () => {
  assert.deepEqual(exerciseTargetParts("12 次 / 30 秒"), { side: "unspecified", reps: "12 次 / 30 秒" });
  assert.deepEqual(exerciseTargetParts("每侧 12 次"), { side: "unspecified", reps: "每侧 12 次" });
  for(const side of ["unspecified","single","both"] as const)for(const reps of ["", "12 次", "30 秒"]){
    const target=exerciseTarget(side,reps);
    assert.deepEqual(exerciseTargetParts(target),{side,reps});
    assert.equal(parseTrainingExercises([{...movement,target}])[0].target,target);
  }
});

test("exercise history reuses latest parameters, adds new ids and never copies progress or overwrites edits",()=>{
  const base: TrainingLog={id:1,occurredAt:"2026-10-26T06:00:00Z",occurredHasExplicitTime:true,trainingType:"strength",bodyParts:["背"],teacher:"",course:"",durationMinutes:30,notes:"",createdAt:"",updatedAt:"",sessionDetails:{plan:null,videos:[],exercises:[{...movement,completedSets:3,completed:true}]}};
  const latest={...base,id:2,occurredAt:"2026-10-27T06:00:00Z",sessionDetails:{...base.sessionDetails!,exercises:[{...movement,sets:4,target:exerciseTarget("single","12 次"),completedSets:4,completed:true}]}};
  const result=trainingExerciseSuggestions([base,latest]);
  assert.deepEqual(result.exercisePresets,[{name:"划船",sets:4,target:"单侧 · 12 次"}]);
  assert.deepEqual(result.previousExercises,result.exercisePresets);
  const reused=reuseTrainingExercises([],result.previousExercises);
  assert.notEqual(reused[0].id,movement.id);assert.equal(reused[0].completedSets,0);assert.equal(reused[0].completed,false);
  assert.equal(reused[0].sets,4);assert.equal(reused[0].target,"单侧 · 12 次");
  const edited={...reused[0],sets:2};
  assert.deepEqual(reuseTrainingExercises([edited],result.previousExercises),[edited]);
  assert.deepEqual(latest.sessionDetails.exercises[0].completedSets,4);
  const full=Array.from({length:30},(_,i)=>({...reused[0],id:String(i),name:String(i)}));
  assert.equal(reuseTrainingExercises(full,result.previousExercises).length,30);
  const parsed=parseTrainingSessionDetails({plan:null,videos:[],exercises:reused});
  assert.deepEqual(parsed?.exercises,reused);
});
test("self-guided plans and independent log snapshots keep actual fields empty", () => {
  const template = trainingTemplate();
  template.days[0].exercises = [movement];
  template.days[0].videoUrls = ["https://example.com/video"];
  const plan = { ...template, version: 1, updatedAt: "" };
  const draft = trainingDayDraft(plan);
  assert.equal(draft.course, ""); assert.equal(draft.notes, "");
  assert.equal(draft.sessionDetails.exercises[0].completedSets, 0);
  assert.equal(draft.sessionDetails.videos[0].completed, false);
  const parsed = parseTrainingPlanWrite({ ...plan, expectedVersion: 1 });
  assert.deepEqual(parsed.days[0].exercises, [movement]);
  template.days[0].exercises[0] = { ...movement, name: "Changed" };
  template.days[0].content = "Changed";
  assert.equal(draft.sessionDetails.exercises[0].name, "划船");
  assert.equal(draft.sessionDetails.plan.content, "Anna 手臂塑形视频 + 自主核心训练");
  assert.equal(trainingSessionTitle(draft.sessionDetails), "Day 1｜上肢 + 核心");
});

test("set progress supports undo, lowered targets and exercises without a set target", () => {
  let exercise: TrainingExerciseLog = { ...movement, completedSets: 0, completed: false };
  exercise = adjustTrainingExercise(exercise, { completedSets: 1 });
  assert.equal(exercise.completedSets, 1); assert.equal(exercise.completed, false);
  exercise = adjustTrainingExercise(exercise, { completedSets: 3 });
  assert.equal(exercise.completed, true);
  exercise = adjustTrainingExercise(exercise, { completedSets: 2 });
  assert.equal(exercise.completed, false);
  assert.equal(adjustTrainingExercise(exercise, { sets: 1 }).completedSets, 1);
  assert.equal(adjustTrainingExercise(exercise, { completedSets: -1 }).completedSets, 0);
  assert.equal(adjustTrainingExercise(exercise, { sets: null, completed: true }).completedSets, 0);
});

test("session boundaries reject invalid sets, duplicate movements, unsafe URLs and oversized snapshots", () => {
  const session = { plan: null, exercises: [{ ...movement, completedSets: 2, completed: false }], videos: [] };
  assert.deepEqual(parseTrainingSessionDetails(session), session);
  for (const sets of [0, 51, 1.5]) assert.throws(() => parseTrainingExercises([{ ...movement, sets }]));
  assert.throws(() => parseTrainingExercises([movement, movement]));
  assert.throws(() => parseTrainingSessionDetails({ ...session, exercises: [{ ...movement, completedSets: 4 }] }));
  assert.throws(() => parseTrainingSessionDetails({ ...session, videos: [{ url: "javascript:alert(1)", completed: false }] }));
  assert.throws(() => parseTrainingSessionDetails({ ...session, exercises: Array.from({ length: 31 }, (_, i) => ({ ...movement, id: String(i) })) }));
  const old = { occurredAt: "2026-10-26T04:00:00Z", trainingType: "strength", bodyParts: ["背"], course: "My course", notes: "My notes" };
  assert.equal(parseNewTrainingLog(old).course, "My course");
  assert.equal("sessionDetails" in parseNewTrainingLog(old), false);
  assert.equal("sessionDetails" in parseTrainingLogPatch({ notes: "updated" }), false);
  assert.equal(parseTrainingLogPatch({ sessionDetails: null }).sessionDetails, null);
});

test("MCP Training Log keeps legacy calls compatible and preserves optional session details on PATCH", async () => {
  let row: TrainingLog | null = null;
  const trainingLog: NonNullable<ResourceRegistryOperations["trainingLog"]> = {
    async create(input) { row = { ...input, id: 1, createdAt: "", updatedAt: "" }; return row; },
    async update(_id, patch) { if (row) for (const [key,value] of Object.entries(patch)) if (value !== undefined) Object.assign(row, { [key]: value }); return row; },
    async get() { return row; }, async search() { return row ? [row] : []; }, async delete() { row = null; return true; },
  };
  const registry = createResourceRegistry({ trainingLog } as unknown as ResourceRegistryOperations);
  const legacy = await registry.create("training_log", { occurred_at: "2026-10-26T04:00:00Z", body_parts: ["背"], course: "Course" });
  assert.equal(legacy.course, "Course");
  assert.equal("session_details" in legacy, false);
  const details = { plan: null, exercises: [{ ...movement, completedSets: 1, completed: false }], videos: [] };
  const updated = await registry.update("training_log", 1, { session_details: details });
  assert.deepEqual(updated.session_details, details);
  const patched = await registry.update("training_log", 1, { notes: "Only notes changed" });
  assert.deepEqual(patched.session_details, details);
  assert.equal(trainingSessionTitle(details), "划船");
  await assert.rejects(registry.update("training_log", 1, { session_details: { ...details, exercises: [{ ...movement, completedSets: 4 }] } }), /组数/);
  await registry.update("training_log", 1, { session_details: null });
  assert.equal((await registry.get("training_log", 1)).session_details, undefined);
});
