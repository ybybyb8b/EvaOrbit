import type { TrainingLog, TrainingPreset } from "./types.ts";

export function buildTrainingPresets(logs: TrainingLog[], limit = 6): TrainingPreset[] {
  const grouped = new Map<string, TrainingPreset>();
  for (const log of logs) {
    const bodyParts = [...log.bodyParts].sort();
    const key = JSON.stringify([log.teacher.trim().toLocaleLowerCase(), log.course.trim().toLocaleLowerCase(), log.trainingType, bodyParts, log.durationMinutes]);
    const current = grouped.get(key);
    if (!current) grouped.set(key, { teacher: log.teacher, course: log.course, trainingType: log.trainingType, bodyParts, durationMinutes: log.durationMinutes, useCount: 1, lastUsedAt: log.occurredAt });
    else { current.useCount += 1; if (log.occurredAt > current.lastUsedAt) current.lastUsedAt = log.occurredAt; }
  }
  return [...grouped.values()].sort((left, right) => right.useCount - left.useCount || right.lastUsedAt.localeCompare(left.lastUsedAt)).slice(0, limit);
}
