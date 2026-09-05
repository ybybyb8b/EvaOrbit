import "server-only";

import { buildHistorySuggestions } from "../history-suggestions";
import { getRepository } from "../repositories";
import type { NewTrainingLog, TrainingLogListInput, TrainingLogPatch } from "../repositories/types";
import { dateRange } from "../time";

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
export async function updateTrainingLog(id: number, input: TrainingLogPatch) { return (await getRepository()).updateTrainingLog(id, input); }
export async function deleteTrainingLog(id: number) { return (await getRepository()).deleteTrainingLog(id); }

export async function getTrainingInputSuggestions() {
  const logs = await (await getRepository()).listTrainingLogs({ limit: 100 });
  return {
    teachers: buildHistorySuggestions(logs, (log) => log.teacher, (log) => log.occurredAt),
    courses: buildHistorySuggestions(logs, (log) => log.course, (log) => log.occurredAt),
  };
}
