import type { TrainingInputSuggestions, TrainingSuggestionExclusion } from "./types.ts";
import { ValidationError } from "./validation.ts";

export function suggestionValue(value: string) { return value.trim().toLocaleLowerCase(); }

export function parseTrainingSuggestionChange(value: unknown): TrainingSuggestionExclusion & { hidden: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("历史选项格式不正确");
  const input = value as Record<string, unknown>;
  if (typeof input.kind !== "string" || !["teacher", "course", "exercise"].includes(input.kind) || typeof input.value !== "string" || !input.value.trim() || input.value.trim().length > (input.kind === "course" ? 160 : 120) || typeof input.hidden !== "boolean") throw new ValidationError("历史选项格式不正确");
  return { kind: input.kind as TrainingSuggestionExclusion["kind"], value: suggestionValue(input.value), hidden: input.hidden };
}

export function filterTrainingSuggestions(data: TrainingInputSuggestions, exclusions: TrainingSuggestionExclusion[]): TrainingInputSuggestions {
  const hidden = new Set(exclusions.map(item => `${item.kind}:${suggestionValue(item.value)}`));
  const visible = (kind: TrainingSuggestionExclusion["kind"], value: string) => !hidden.has(`${kind}:${suggestionValue(value)}`);
  return { ...data, exclusions,
    teachers: data.teachers.filter(value => visible("teacher", value)),
    courses: data.courses.filter(value => visible("course", value)),
    exercises: data.exercises?.filter(value => visible("exercise", value)),
    exercisePresets: data.exercisePresets?.filter(item => visible("exercise", item.name)),
    previousExercises: data.previousExercises?.filter(item => visible("exercise", item.name)),
    presets: data.presets.filter(item => visible("teacher", item.teacher) && visible("course", item.course)),
  };
}
