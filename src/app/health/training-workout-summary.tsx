"use client";
import { useLocale } from "@/components/locale-controller";
import { workoutActivityLabel, workoutStatus } from "@/lib/training-workout";
import type { TrainingLog } from "@/lib/types";

export function TrainingWorkoutSummary({ record }: { record: TrainingLog }) {
  const { english } = useLocale();
  const source = record.workout;
  const facts = source?.workout;
  if (!facts || !source) return null;
  const number = (value: number) => new Intl.NumberFormat(english ? "en" : "zh-CN", { maximumFractionDigits: 3 }).format(value);
  const instant = (value: string) => new Intl.DateTimeFormat(english ? "en" : "zh-CN", { dateStyle: "medium", timeStyle: "medium", timeZone: source.timeZone }).format(new Date(value));
  return <section className="training-workout-summary" aria-label="Apple Health Workout">
    <strong>{workoutActivityLabel(record, english)}</strong>
    <p>{workoutStatus(record, english)}</p>
    <dl>
      <div><dt>{english ? "Started" : "开始"}</dt><dd>{instant(source.startAt!)} · {source.timeZone}</dd></div>
      <div><dt>{english ? "Ended" : "结束"}</dt><dd>{instant(source.endAt!)}</dd></div>
      <div><dt>{english ? "Duration" : "时长"}</dt><dd>{number(facts.durationSeconds / 60)} {english ? "min" : "分钟"}</dd></div>
      {facts.activeEnergyKcal !== undefined && <div><dt>{english ? "Active energy" : "活动能量"}</dt><dd>{number(facts.activeEnergyKcal)} kcal</dd></div>}
      {facts.distance !== undefined && <div><dt>{english ? "Distance" : "距离"}</dt><dd>{number(facts.distance)} m</dd></div>}
      <div><dt>{english ? "Source" : "来源"}</dt><dd>{[source.sourceName, source.sourceBundle, facts.deviceName, facts.deviceModel, facts.deviceManufacturer].filter(Boolean).join(" · ") || "Apple Health"}</dd></div>
    </dl>
    <p>{english ? "Movement data stays in sync with Apple Health. Add your training details below." : "运动数据由 Apple Health 同步，在下方补充这次具体练了什么。"}</p>
  </section>;
}
