"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardHeart, Droplet, Dumbbell, Flame, MoonSleep, Weight } from "reicon-react";
import { useLocale } from "@/components/locale-controller";
import { homeDurationLabel } from "@/lib/home-day";
import { sleepDisplay, type DailySleepSummary } from "@/lib/sleep";
import { dateInEvaOrbit, EVAORBIT_TIME_ZONE } from "@/lib/time";
import { formatWeightKg, normalizeWeightKg } from "@/lib/weight";
import type { DailyNutritionSummary, MenstrualPeriod, ScheduledNotification, TrainingLog, WeightRecord } from "@/lib/types";
import { trainingTypeLabels } from "./training-log-editor";
import styles from "./health-overview.module.css";

type Props = {
  initialSleep: DailySleepSummary;
  initialEnergy: DailyNutritionSummary;
  initialTraining: TrainingLog[];
  initialWeights: WeightRecord[];
  initialPeriods: MenstrualPeriod[];
  initialMedicationReminders: ScheduledNotification[];
  today: string;
  children?: ReactNode;
};

export function HealthOverview({ initialSleep: sleep, initialEnergy: energy, initialTraining, initialWeights, initialPeriods, initialMedicationReminders, today, children }: Props) {
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  const duration = (minutes: number) => homeDurationLabel(Math.round(minutes), english);
  const compactDuration = (minutes: number) => duration(minutes).replaceAll(" ", "").replace("小时", "时").replace("分钟", "分");
  const displaySleep = sleepDisplay(sleep);
  const weights = [...initialWeights].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const latest = weights[0];
  const weightChange = latest && weights[1] ? normalizeWeightKg(latest.weightKg - weights[1].weightKg) : null;
  const training = initialTraining.filter(item => dateInEvaOrbit(new Date(item.occurredAt)) === today);
  const knownMinutes = training.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
  const hasDuration = training.some(item => item.durationMinutes !== null);
  const period = [...initialPeriods].filter(item => !item.endedOn && item.startedOn <= today).sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0];
  const periodDay = period ? Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${period.startedOn}T12:00:00Z`)) / 86_400_000) + 1 : null;
  const reminder = [...initialMedicationReminders].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString(english ? "en-US" : "zh-CN", { maximumFractionDigits: 0 });
  const date = (value: string, hasTime = false, zone = EVAORBIT_TIME_ZONE) => new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", {
    month: "short", day: "numeric", ...(hasTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}), timeZone: zone,
  }).format(new Date(value));
  const clock = (value: string, zone: string) => new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(value));
  return <div className={styles.overview}>
    <div className={styles.primary}>
      <Link href="/health?view=sleep" className={`${styles.tile} ${styles.sleep}`}>
        <div className={styles.tileTop}><MoonSleep weight="Filled" aria-hidden="true" /><strong className={styles.sleepValue}>{displaySleep ? compactDuration(displaySleep.durationMinutes) : "—"}</strong></div>
        <div className={styles.tileCopy}><h2>{t("Sleep", "睡眠")}</h2><p>{date(`${sleep.date}T12:00:00+08:00`)} · {t("wake date", "醒来")}</p><p>{sleep.actual ? t("Main sleep · measured", "主睡眠 · 实测") : sleep.window ? t("Window · estimated", "睡眠窗口 · 估算") : t("No sleep data", "暂无睡眠数据")}</p></div>
        {displaySleep && <p className={styles.sleepTimes}>{clock(displaySleep.startAt, "timeZone" in displaySleep ? displaySleep.timeZone : EVAORBIT_TIME_ZONE)} — {clock(displaySleep.endAt, "timeZone" in displaySleep ? displaySleep.timeZone : EVAORBIT_TIME_ZONE)}</p>}
        {sleep.actual && sleep.secondary.length > 0 && <p className={styles.sleepOther}>{t("Other sleep", "其他睡眠")} {compactDuration(sleep.napMinutes)} · {t("Total", "合计")} {compactDuration(sleep.actual.durationMinutes + sleep.napMinutes)}</p>}
      </Link>
      <Link href="/health?view=weight" className={`${styles.tile} ${styles.weight}`}>
        <div className={styles.tileTop}><Weight weight="Filled" aria-hidden="true" /><strong>{latest ? formatWeightKg(latest.weightKg) : "—"}{latest && <small>kg</small>}</strong></div>
        <div className={styles.tileCopy}><h2>{t("Weight", "体重")}</h2><p>{latest ? date(latest.occurredAt, latest.occurredHasExplicitTime) : t("No weight recorded", "尚未记录体重")}</p>{weightChange !== null && <p>{t("Since previous", "相比上次")} {weightChange > 0 ? "+" : ""}{formatWeightKg(weightChange)} kg</p>}</div>
      </Link>
    </div>
    <div className={styles.primary}>
      <Link href="/health?view=training" className={`${styles.tile} ${styles.training}`}>
        <div className={styles.tileTop}><Dumbbell weight="Filled" aria-hidden="true" /><strong>{training.length}<small>{t("logs", "次")}</small></strong></div>
        <div className={styles.tileCopy}><h2>{t("Training today", "今日训练")}</h2><p>{training.length ? [...new Set(training.map(item => trainingTypeLabels[item.trainingType][english ? "en" : "zh"]))].join(" · ") : t("No training logged", "尚未记录训练")}</p>{hasDuration && <p>{compactDuration(knownMinutes)} · {t("logged duration", "已记录时长")}</p>}</div>
      </Link>
      <Link href="/health?view=cycle" className={`${styles.tile} ${styles.cycle}`}>
        <div className={styles.tileTop}><Droplet weight="Filled" aria-hidden="true" /><strong>{periodDay ? <><small>{t("Day", "第")}</small>{periodDay}{!english && <small>天</small>}</> : "—"}</strong></div>
        <div className={styles.tileCopy}><h2>{t("Period & medication", "经期与用药")}</h2><p>{period ? `${t("Started", "开始于")} ${date(`${period.startedOn}T12:00:00+08:00`)}` : t("No active period", "暂无进行中经期")}</p>{reminder && <p>{t("Next dose reminder", "下次服药提醒")}<br />{date(reminder.scheduledAt, true)}</p>}</div>
      </Link>
    </div>
    <Link href="/health?view=energy" className={`${styles.tile} ${styles.energy}`}>
      <div className={styles.energyHeading}><span><Flame weight="Filled" aria-hidden="true" /><h2>{t("Energy today", "今日能量")}</h2></span><small>{t("So far today", "截至目前")}</small></div>
      <dl className={styles.energyValues}>{[
        { label: t("Estimated intake", "估算摄入"), value: energy.estimatedIntakeKcal },
        { label: t("Expenditure", "消耗"), value: energy.totalExpenditureKcal },
        { label: t("Balance", "差额"), value: energy.energyBalance },
      ].map(item => <div key={item.label}><dt>{item.label}</dt><dd>{number(item.value)}{item.value !== null && <small>kcal</small>}</dd>{item.value === null && <span>{t("Not recorded", "未记录")}</span>}</div>)}</dl>
    </Link>
    {children}
    <Link href="/health?view=records" className={`${styles.tile} ${styles.records}`}><ClipboardHeart weight="Filled" aria-hidden="true" /><div className={styles.tileCopy}><h2>{t("Health records", "健康记录")}</h2><p>{t("View and add health records", "查看与新增健康记录")}</p></div></Link>
  </div>;
}
