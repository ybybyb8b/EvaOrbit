import "server-only";

import { buildHistorySuggestions } from "../history-suggestions";
import { getRepository } from "../repositories";
import type { NewTrainingLog, TrainingLogListInput, TrainingLogPatch } from "../repositories/types";
import { dateRange } from "../time";

export async function listTrainingLogs(input: TrainingLogListInput & { date?: string } = {}) {
  const { date, ...query } = input;
  return (await getRepository()).listTrainingLogs(date ? { ...query, ...dateRange(date) } : query);
}

export async function getTrainingLog(id: number) { return (await getRepository()).getTrainingLog(id); }
export async function createTrainingLog(input: NewTrainingLog) { return (await getRepository()).createTrainingLog(input); }
export async function updateTrainingLog(id: number, input: TrainingLogPatch) { return (await getRepository()).updateTrainingLog(id, input); }
export async function deleteTrainingLog(id: number) { return (await getRepository()).deleteTrainingLog(id); }

export async function getTrainingInputSuggestions() {
  const logs = await (await getRepository()).listTrainingLogs({ limit: 100 });
  return {
    teachers: buildHistorySuggestions(logs, (log) => log.teacher, (log) => log.occurredAt),
    courses: buildHistorySuggestions(logs, (log) => log.course, (log) => log.occurredAt),
  };
}
