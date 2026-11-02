import assert from "node:assert/strict";
import test from "node:test";
import { filterTrainingSuggestions, parseTrainingSuggestionChange } from "./training-suggestions.ts";
import type { TrainingInputSuggestions } from "./types.ts";

test("removed history options stay out of every suggestion path and can be restored", () => {
  const source: TrainingInputSuggestions = { teachers: ["Anna", "Pamela"], courses: ["Core", "Cardio"], presets: [], exercises: ["肩绕还", "划船"], exercisePresets: [{ name: "肩绕还", sets: 2, target: "30 秒", phase: "warmup" }, { name: "肩绕还", sets: 3, target: "12 次" }], previousExercises: [{ name: "肩绕还", sets: 2, target: "30 秒" }] };
  const exclusions = [{ kind: "teacher", value: "anna" }, { kind: "course", value: "core" }, { kind: "exercise", value: "肩绕还" }] as const;
  const result = filterTrainingSuggestions(source, [...exclusions]);
  assert.deepEqual(result.teachers, ["Pamela"]); assert.deepEqual(result.courses, ["Cardio"]);
  assert.deepEqual(result.exercises, ["划船"]); assert.deepEqual(result.exercisePresets, []); assert.deepEqual(result.previousExercises, []);
  assert.deepEqual(source.teachers, ["Anna", "Pamela"]);
  assert.deepEqual(filterTrainingSuggestions(source, []).exercises, source.exercises);
  assert.deepEqual(parseTrainingSuggestionChange({ kind: "teacher", value: " Anna ", hidden: true }), { kind: "teacher", value: "anna", hidden: true });
  for (const input of [null, { kind: "other", value: "name", hidden: true }, { kind: "teacher", value: "", hidden: true }, { kind: "exercise", value: "x".repeat(121), hidden: true }, { kind: "course", value: "name", hidden: "yes" }]) assert.throws(() => parseTrainingSuggestionChange(input));
});
