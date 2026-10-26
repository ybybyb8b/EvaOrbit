import type { TrainingLog } from "./types";

const activityNames: Record<string, [string, string]> = {
  cycling: ["骑行", "Cycling"], functionalStrengthTraining: ["功能性力量训练", "Functional strength"], hiking: ["徒步", "Hiking"],
  rowing: ["划船", "Rowing"], running: ["跑步", "Running"], traditionalStrengthTraining: ["传统力量训练", "Strength training"],
  swimming: ["游泳", "Swimming"], walking: ["步行", "Walking"], yoga: ["瑜伽", "Yoga"],
  pilates: ["普拉提", "Pilates"], highIntensityIntervalTraining: ["高强度间歇训练", "HIIT"], coreTraining: ["核心训练", "Core training"],
  elliptical: ["椭圆机", "Elliptical"], stairClimbing: ["爬楼机", "Stair climbing"], mixedCardio: ["混合有氧", "Mixed cardio"],
  dance: ["舞蹈", "Dance"], cooldown: ["放松", "Cooldown"], flexibility: ["柔韧性训练", "Flexibility"],
};

export function workoutActivityLabel(log: TrainingLog, english = false) {
  const type = log.workout?.workout?.activityType;
  return type === undefined ? "" : activityNames[log.workout?.workout?.activityName ?? ""]?.[english ? 1 : 0] ?? `${english ? "Workout" : "运动"} (${type})`;
}

export function workoutStatus(log: TrainingLog, english = false) {
  if (!log.workout) return english ? "Manual" : "手动记录";
  if (log.workoutDeleted) return english ? "Deleted in Apple Health" : "已在 Apple Health 删除";
  return log.detailsCompletedAt ? "Apple Health" : english ? "Apple Health · Add details" : "Apple Health · 待补充";
}
