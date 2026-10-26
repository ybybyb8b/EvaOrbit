import type { TrainingExerciseLog, TrainingExercisePreset, TrainingLog, TrainingSessionDetails } from "./types.ts";

export type ExerciseSide = "unspecified" | "single" | "both";
// Keep side and reps in the existing target text so older clients and saved plans remain compatible.
export function exerciseTargetParts(target: string): { side: ExerciseSide; reps: string } {
  const match = /^(单侧|双侧) ·(?: (.*))?$/.exec(target);
  return match ? { side: match[1] === "单侧" ? "single" : "both", reps: match[2] ?? "" } : { side: "unspecified", reps: target };
}
export function exerciseTarget(side: ExerciseSide, reps: string): string {
  return side === "unspecified" ? reps : `${side === "single" ? "单侧" : "双侧"} · ${reps}`.trimEnd();
}

export function trainingExerciseSuggestions(logs: TrainingLog[]) {
  const sessions = [...logs].filter(log => log.sessionDetails?.exercises.some(item => item.name.trim()))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
  const preset = ({ name, sets, target }: TrainingExercisePreset): TrainingExercisePreset => ({ name, sets, target });
  const previousExercises = (sessions[0]?.sessionDetails?.exercises ?? []).filter(item => item.name.trim()).map(preset);
  const byName = new Map<string, TrainingExercisePreset>();
  for (const log of sessions) for (const exercise of log.sessionDetails!.exercises) {
    const name = exercise.name.trim().toLocaleLowerCase();
    if (name && !byName.has(name)) byName.set(name, preset(exercise));
  }
  return { exercisePresets: [...byName.values()].slice(0, 30), previousExercises };
}

export function reuseTrainingExercises(items: TrainingExerciseLog[], presets: TrainingExercisePreset[]): TrainingExerciseLog[] {
  const names = new Set(items.map(item => item.name.trim().toLocaleLowerCase()));
  const added: TrainingExerciseLog[] = [];
  for (const preset of presets) {
    const name = preset.name.trim().toLocaleLowerCase();
    if (!name || names.has(name) || items.length + added.length >= 30) continue;
    names.add(name);
    added.push({ ...preset, id: crypto.randomUUID(), completedSets: 0, completed: false });
  }
  return [...items, ...added];
}

export function adjustTrainingExercise(item: TrainingExerciseLog, patch: Partial<TrainingExerciseLog>): TrainingExerciseLog {
  const next = { ...item, ...patch };
  const completedSets = Math.max(0, Math.min(next.completedSets, next.sets ?? 0));
  return { ...next, completedSets, completed: next.sets === null ? next.completed : completedSets === next.sets };
}

export function trainingSessionTitle(session: TrainingSessionDetails | null | undefined): string {
  return session?.plan ? `Day ${session.plan.dayNumber}｜${session.plan.dayName}` : session?.exercises[0]?.name ?? "";
}
