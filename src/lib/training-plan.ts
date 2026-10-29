import type { TrainingPlan, TrainingPlanDay } from "./types.ts";
import { parseNewTrainingLog, parseTrainingLogPatch, parseTrainingExercises, ValidationError } from "./validation.ts";
import type { NewTrainingLog } from "./repositories/types";

export type TrainingPlanWrite = Pick<TrainingPlan, "name" | "days" | "currentDayId"> & { expectedVersion: number };
export type TrainingWorkoutDetails = Pick<NewTrainingLog, "bodyParts" | "teacher" | "course" | "notes" | "trainingContent" | "sessionDetails">;
export type TrainingPlanCompletion = { expectedVersion: number; dayId: string; requestKey: string } & (
  { workoutLogId?: never; log: NewTrainingLog } | { workoutLogId: number; log: TrainingWorkoutDetails }
);

export function trainingTemplate(): Pick<TrainingPlan, "name" | "days" | "currentDayId"> {
  const days: TrainingPlanDay[] = [
    { id: "day-1", name: "上肢 + 核心", trainingType: "strength", bodyParts: ["手臂", "核心"], durationMinutes: null, content: "Anna 手臂塑形视频 + 自主核心训练", videoUrls: [] },
    { id: "day-2", name: "低冲击有氧", trainingType: "cardio", bodyParts: ["全身"], durationMinutes: 25, content: "帕梅拉有氧跟练，约 25 分钟", videoUrls: [] },
    { id: "day-3", name: "臀腿后侧 + 背部", trainingType: "strength", bodyParts: ["腿", "背"], durationMinutes: null, content: "臀桥、罗马尼亚硬拉、蚌式开合、划船等自主训练", videoUrls: [] },
    { id: "day-4", name: "核心 + 轻有氧", trainingType: "mixed", bodyParts: ["核心", "全身"], durationMinutes: null, content: "Anna 核心训练 + 轻有氧", videoUrls: [] },
  ];
  return { name: "四日循环训练", days, currentDayId: days[0].id };
}

// Keep the same day through reordering; after deletion prefer its next surviving day.
export function retainedTrainingDay(previous: TrainingPlanDay[], next: TrainingPlanDay[], current: string | null): string | null {
  if (next.some(day => day.id === current)) return current;
  const index = previous.findIndex(day => day.id === current);
  for (let offset = 1; offset <= previous.length; offset++) {
    const candidate = previous[(index + offset) % previous.length];
    if (next.some(day => day.id === candidate.id)) return candidate.id;
  }
  return next[0]?.id ?? null;
}

export function trainingDayDraft(plan: TrainingPlan) {
  const index = plan.days.findIndex(day => day.id === plan.currentDayId);
  const day = plan.days[index];
  if (!day) throw new ValidationError("请先添加训练日");
  return { trainingType: day.trainingType, bodyParts: [...day.bodyParts], teacher: "", course: "", durationMinutes: day.durationMinutes, notes: "", sessionDetails: {
    plan: { name: plan.name, dayName: day.name, dayNumber: index + 1, content: day.content },
    exercises: (day.exercises ?? []).map(exercise => ({ ...exercise, completedSets: 0, completed: false })),
    videos: day.videoUrls.map(url => ({ url, completed: false })),
  } };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("训练计划格式不正确");
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number, required = true): string {
  if (typeof value !== "string" || value.trim().length > limit || (required && !value.trim())) throw new ValidationError("训练计划字段为空或过长");
  return value.trim();
}
function version(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ValidationError("训练计划版本不正确");
  return value;
}

export function parseTrainingPlanWrite(value: unknown): TrainingPlanWrite {
  const input = object(value);
  if (!Array.isArray(input.days) || input.days.length > 30) throw new ValidationError("训练日最多 30 个");
  const days = input.days.map(value => {
    const day = object(value);
    const id = text(day.id, 64);
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new ValidationError("训练日 ID 不正确");
    const fields = parseNewTrainingLog({ ...day, occurredAt: "2026-01-01T04:00:00Z" });
    if (fields.durationMinutes !== null && !Number.isInteger(fields.durationMinutes)) throw new ValidationError("训练时长须为整数分钟");
    if (!Array.isArray(day.videoUrls) || day.videoUrls.length > 8) throw new ValidationError("每个训练日最多 8 个视频链接");
    const videoUrls = day.videoUrls.map(value => {
      const url = text(value, 250);
      try { if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error(); }
      catch { throw new ValidationError("视频链接须为完整的 http 或 https 地址"); }
      return url;
    });
    return { id, name: text(day.name, 120), trainingType: fields.trainingType, bodyParts: fields.bodyParts, durationMinutes: fields.durationMinutes, content: text(day.content, 2500, false), videoUrls, ...(day.exercises === undefined ? {} : { exercises: parseTrainingExercises(day.exercises) }) };
  });
  if (new Set(days.map(day => day.id)).size !== days.length) throw new ValidationError("训练日 ID 不能重复");
  const currentDayId = input.currentDayId === null ? null : text(input.currentDayId, 64);
  if (days.length ? !days.some(day => day.id === currentDayId) : currentDayId !== null) throw new ValidationError("当前训练日不在计划中");
  return { name: text(input.name, 120), days, currentDayId, expectedVersion: version(input.expectedVersion) };
}

export function parseTrainingPlanCompletion(value: unknown): TrainingPlanCompletion {
  const input = object(value);
  const requestKey = text(input.requestKey, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) throw new ValidationError("完成请求标识不正确");
  const completion = { expectedVersion: version(input.expectedVersion), dayId: text(input.dayId, 64), requestKey };
  if (input.workoutLogId !== undefined) {
    if (typeof input.workoutLogId !== "number" || !Number.isSafeInteger(input.workoutLogId) || input.workoutLogId < 1) throw new ValidationError("Workout 记录标识不正确");
    const body = object(input.log);
    if (["occurredAt", "occurredHasExplicitTime", "trainingType", "durationMinutes"].some(key => key in body)) throw new ValidationError("Workout 原始运动数据不可修改");
    const log = parseTrainingLogPatch(body);
    if (!log.bodyParts?.length) throw new ValidationError("请至少选择一个训练部位");
    return { ...completion, workoutLogId: input.workoutLogId, log: { bodyParts: log.bodyParts, teacher: log.teacher ?? "", course: log.course ?? "", notes: log.notes ?? "", trainingContent: log.trainingContent ?? "", sessionDetails: log.sessionDetails } };
  }
  const log = parseNewTrainingLog(input.log);
  if (log.durationMinutes !== null && !Number.isInteger(log.durationMinutes)) throw new ValidationError("训练时长须为整数分钟");
  return { ...completion, log };
}
