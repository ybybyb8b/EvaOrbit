"use client";
import { homeDurationLabel } from "@/lib/home-day";
import { firstSleepWakeDate, sleepOverviewRows, type DailySleepSummary } from "@/lib/sleep";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import styles from "./sleep-summary.module.css";

export function SleepOverviewPreview({ summary, english }: { summary: DailySleepSummary; english: boolean }) {
  const labels = english ? { total: "Total sleep", main: "Main sleep", other: "Other sleep", window: "Sleep window" } : { total: "总睡眠", main: "主睡眠", other: "其他睡眠", window: "睡眠窗口" };
  return <span className={styles.preview}>{sleepOverviewRows(summary).map(({ kind, durationMinutes }, index) =>
    <span key={`${kind}-${index}`} data-kind={kind}><strong>{homeDurationLabel(Math.round(durationMinutes), english).replaceAll(" ", "")}</strong><span>{labels[kind]}</span></span>
  )}</span>;
}

export function SleepSummary({ summary, english }: { summary: DailySleepSummary; english: boolean }) {
  const duration = (minutes: number | null) => minutes === null ? "—" : homeDurationLabel(Math.round(minutes), english);
  const time = (instant: string, timeZone: string) => new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(instant));
  const actual = summary.actual, window = summary.window;
  return <div className={styles.summary}>
    <h3 className={styles.heading}>{english ? "Main sleep" : "主睡眠"}</h3>
    <dl className={styles.metrics}>
      <div><dt>{english ? "Actual Sleep" : "实际睡眠"}</dt><dd>{duration(actual?.durationMinutes ?? null)}</dd></div>
      <div><dt>{english ? "Sleep Window" : "睡眠窗口"}</dt><dd>{duration(window?.durationMinutes ?? null)}</dd></div>
      <div><dt>{english ? "Sleep Efficiency" : "睡眠效率"}</dt><dd>{summary.efficiency === null ? "—" : `${Math.round(summary.efficiency * 100)}%`}</dd></div>
    </dl>
    {actual && <p>{english ? "Fell asleep / woke" : "入睡 / 醒来"}<strong>{time(actual.startAt, actual.timeZone)} — {time(actual.endAt, actual.timeZone)}</strong></p>}
    {window && <p>{english ? "Timeline window" : "时间线窗口"}<strong>{time(window.startAt, EVAORBIT_TIME_ZONE)} — {time(window.endAt, EVAORBIT_TIME_ZONE)}</strong></p>}
    {summary.windowMinusActualMinutes !== null && <p>{english ? "Window − actual" : "窗口 − 实际睡眠"}<strong>{summary.windowMinusActualMinutes < 0 ? "−" : ""}{duration(Math.abs(summary.windowMinusActualMinutes))}</strong></p>}
    <p>{english ? "Source" : "数据来源"}<strong>{actual ? `Apple Health · ${actual.sourceName || actual.sourceBundle}` : window ? english ? "Calendar / 3×3 · Timeline estimate" : "Calendar / 3×3 · 时间线估算" : english ? "No sleep data for this wake date" : "这个醒来日期还没有睡眠数据"}</strong></p>
    {!actual && <small>{summary.date < firstSleepWakeDate ? english ? "Apple Health sleep is available from October 1, 2026." : "Apple Health 实际睡眠从 2026-10-01 起同步。" : english ? "EO has no measured sleep for this wake date yet. Check HealthKit sync and the wake date in Apple Health. A timeline window is only an estimate." : "EO 尚未收到这个醒来日期的实际睡眠，请核对 HealthKit 同步及 Apple 健康中的醒来日期。时间线窗口仅为估算。"}</small>}
    {actual && !window && <small>{english ? "No timeline sleep window to compare." : "还没有可用于对比的时间线睡眠窗口。"}</small>}
    {actual && window && !summary.comparable && <small>{english ? "Sleep and timeline window do not overlap; efficiency is unavailable." : "实际睡眠与时间线窗口没有重叠，暂不计算效率。"}</small>}
    {summary.efficiency !== null && summary.efficiency > 1 && <small>{english ? "Actual sleep exceeds the timeline window. Check its boundaries." : "实际睡眠超过时间线窗口，请检查窗口起止时间。"}</small>}
    {actual?.timeZoneSource === "device" && <small>{english ? `Time zone: ${actual.timeZone} (device zone when read; HealthKit supplied no zone).` : `时区：${actual.timeZone}（读取时的设备时区；HealthKit 未提供时区）。`}</small>}
    {!!summary.secondary?.length && <div className={styles.secondary}>
      <h3 className={styles.heading}>{english ? "Other sleep" : "其他睡眠"}</h3>
      {summary.secondary.map(({ actual: episode, window: episodeWindow }, index) => <article className={styles.episode} key={`${episode.startAt}-${episode.endAt}`}>
        {summary.secondary.length > 1 && <h4>{english ? `Other sleep ${index + 1}` : `其他睡眠 ${index + 1}`}</h4>}
        <dl className={styles.metrics}>
          <div><dt>{english ? "Actual Sleep" : "实际睡眠"}</dt><dd>{duration(episode.durationMinutes)}</dd></div>
          <div><dt>{english ? "Sleep Window" : "睡眠窗口"}</dt><dd>{duration(episodeWindow?.durationMinutes ?? null)}</dd></div>
        </dl>
        <p>{english ? "Fell asleep / woke" : "入睡 / 醒来"}<strong>{time(episode.startAt, episode.timeZone)} — {time(episode.endAt, episode.timeZone)}</strong></p>
        {episodeWindow ? <><p>{english ? "Timeline window" : "时间线窗口"}<strong>{time(episodeWindow.startAt, EVAORBIT_TIME_ZONE)} — {time(episodeWindow.endAt, EVAORBIT_TIME_ZONE)}</strong></p>{episodeWindow.notes && <p className={styles.notes}>{episodeWindow.notes}</p>}</> : <small>{english ? "No overlapping timeline sleep window." : "未关联到重叠的时间线睡眠窗口。"}</small>}
        <p>{english ? "Source" : "数据来源"}<strong>Apple Health · {episode.sourceName || episode.sourceBundle}</strong></p>
      </article>)}
    </div>}
  </div>;
}
