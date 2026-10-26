import "server-only";

import { buildHistorySuggestions } from "../history-suggestions";
import { getRepository } from "../repositories";
import type { NewTrainingLog, TrainingLogListInput, TrainingLogPatch } from "../repositories/types";
import { HttpError } from "../errors";
import { dateRange } from "../time";
import { buildTrainingPresets } from "../training-presets";
import { trainingExerciseSuggestions } from "../training-session";
import type { TrainingPlanWrite, TrainingPlanCompletion } from "../training-plan";

export async function getTrainingPlan() { return (await getRepository()).getTrainingPlan(); }
export async function saveTrainingPlan(input: TrainingPlanWrite) { return (await getRepository()).saveTrainingPlan(input); }
export async function completeTrainingPlan(input: TrainingPlanCompletion) { return (await getRepository()).completeTrainingPlan(input); }

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1, 12));
  return { from: dateRange(`${month}-01`).from, to: dateRange(next.toISOString().slice(0, 7) + "-01").from };
}

export async function listTrainingLogs(input: TrainingLogListInput & { date?: string; month?: string } = {}) {
  const { date, month, ...query } = input;
  const range = date ? dateRange(date) : month ? monthRange(month) : null;
  return (await getRepository()).listTrainingLogs(range ? { ...query, ...range } : query);
}

export async function getTrainingLog(id: number) { return (await getRepository()).getTrainingLog(id); }
export async function createTrainingLog(input: NewTrainingLog) { return (await getRepository()).createTrainingLog(input); }
export async function updateTrainingLog(id: number, input: TrainingLogPatch) {
  const repository = await getRepository();
  const existing = await repository.getTrainingLog(id);
  if (!existing) return null;
  if (existing.workout) {
    if (existing.workoutDeleted) throw new HttpError("Workout was deleted in Apple Health", 409);
    if (["occurredAt", "occurredHasExplicitTime", "trainingType", "durationMinutes"].some(key => input[key as keyof TrainingLogPatch] !== undefined)) throw new HttpError("Workout source is read only", 400);
  }
  return repository.updateTrainingLog(id, input);
}
export async function deleteTrainingLog(id: number) {
  const repository = await getRepository();
  if ((await repository.getTrainingLog(id))?.workout) throw new HttpError("Delete this workout in Apple Health", 409);
  return repository.deleteTrainingLog(id);
}

export async function getTrainingInputSuggestions() {
  const logs = await (await getRepository()).listTrainingLogs({ limit: 100 });
  return {
    teachers: buildHistorySuggestions(logs, (log) => log.teacher, (log) => log.occurredAt),
    courses: buildHistorySuggestions(logs, (log) => log.course, (log) => log.occurredAt),
    presets: buildTrainingPresets(logs),
    exercises: buildHistorySuggestions(logs.flatMap(log => (log.sessionDetails?.exercises ?? []).map(exercise => ({ name: exercise.name, at: log.occurredAt }))), item => item.name, item => item.at),
    ...trainingExerciseSuggestions(logs),
  };
}
