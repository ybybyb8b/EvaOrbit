import type { TrainingLog, TrainingPreset } from "./types.ts";

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 30;
const MIN_RELEVANCE = 0.25;

export function buildTrainingPresets(logs: TrainingLog[], limit = 5, now = new Date()): TrainingPreset[] {
  const grouped = new Map<string, TrainingPreset & { relevance: number }>();
  const nowMs = now.getTime();
  for (const log of logs) {
    const bodyParts = [...log.bodyParts].sort();
    const key = JSON.stringify([log.teacher.trim().toLocaleLowerCase(), log.course.trim().toLocaleLowerCase(), log.trainingType, bodyParts, log.durationMinutes]);
    const ageDays = Math.max(0, (nowMs - new Date(log.occurredAt).getTime()) / DAY_MS);
    const relevance = 0.5 ** (ageDays / HALF_LIFE_DAYS);
    const current = grouped.get(key);
    if (!current) grouped.set(key, { teacher: log.teacher, course: log.course, trainingType: log.trainingType, bodyParts, durationMinutes: log.durationMinutes, useCount: 1, lastUsedAt: log.occurredAt, relevance });
    else { current.useCount += 1; current.relevance += relevance; if (log.occurredAt > current.lastUsedAt) current.lastUsedAt = log.occurredAt; }
  }
  return [...grouped.values()].filter(item => item.relevance >= MIN_RELEVANCE).sort((left, right) => right.relevance - left.relevance || right.lastUsedAt.localeCompare(left.lastUsedAt)).slice(0, limit).map(item => ({ teacher: item.teacher, course: item.course, trainingType: item.trainingType, bodyParts: item.bodyParts, durationMinutes: item.durationMinutes, useCount: item.useCount, lastUsedAt: item.lastUsedAt }));
}
