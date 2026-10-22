"use client";
import { homeDurationLabel } from "@/lib/home-day";
import { firstSleepWakeDate, recordedSleepWindows, sleepPresentationRows, type DailySleepSummary } from "@/lib/sleep";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import type {HomeSleepSummary} from "@/lib/home-day";
import styles from "./sleep-summary.module.css";

export function SleepOverviewPreview({ summary, english, timeline }: { summary: DailySleepSummary; english: boolean; timeline?: HomeSleepSummary | null }) {
  const labels = english ? { total: "Total sleep", main: "Main sleep", other: "Other sleep", window: "Calendar record", recorded: "Calendar record", mixedTotal: "Total · includes calendar" } : { total: "总睡眠", main: "主睡眠", other: "其他睡眠", window: "日历记录", recorded: "日历记录", mixedTotal: "合计 · 含日历记录" };
  return <span className={styles.preview}>{sleepPresentationRows(summary,timeline).map(({ kind, durationMinutes }, index) =>
    <span key={`${kind}-${index}`} data-kind={kind}><strong>{homeDurationLabel(Math.round(durationMinutes), english).replaceAll(" ", "")}</strong><span>{labels[kind]}</span></span>
  )}</span>;
}

export function SleepSummary({ summary, english, timeline }: { summary: DailySleepSummary; english: boolean; timeline?: HomeSleepSummary | null }) {
  const duration = (minutes: number | null) => minutes === null ? "—" : homeDurationLabel(Math.round(minutes), english);
  const time = (instant: string, timeZone: string) => new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(instant));
  const actual = summary.actual, window = summary.window;
  const recorded = recordedSleepWindows(summary,timeline);
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
    <p>{english ? "Source" : "数据来源"}<strong>{actual ? `Apple Health · ${actual.sourceName || actual.sourceBundle}` : window ? english ? "Calendar / 3×3 · Recorded sleep" : "Calendar / 3×3 · 日历记录" : english ? "No sleep data for this wake date" : "这个醒来日期还没有睡眠数据"}</strong></p>
    {!actual && <small>{summary.date < firstSleepWakeDate ? english ? "Apple Health sleep is available from October 1, 2026." : "Apple Health 实际睡眠从 2026-10-01 起同步。" : english ? "No device measurement is available for this wake date. Calendar-recorded sleep remains visible." : "这个醒来日期暂无设备测量，日历记录的睡眠仍然保留。"}</small>}
    {actual && !window && <small>{english ? "No timeline sleep window to compare." : "还没有可用于对比的时间线睡眠窗口。"}</small>}
    {actual && window && !summary.comparable && <small>{english ? "Sleep and timeline window do not overlap; efficiency is unavailable." : "实际睡眠与时间线窗口没有重叠，暂不计算效率。"}</small>}
    {summary.efficiency !== null && summary.efficiency > 1 && <small>{english ? "Actual sleep exceeds the timeline window. Check its boundaries." : "实际睡眠超过时间线窗口，请检查窗口起止时间。"}</small>}
    {actual?.timeZoneSource === "device" && <small>{english ? `Time zone: ${actual.timeZone} (device zone when read; HealthKit supplied no zone).` : `时区：${actual.timeZone}（读取时的设备时区；HealthKit 未提供时区）。`}</small>}
    {!!recorded.length && <div className={styles.secondary}><h3 className={styles.heading}>{english?"Calendar-recorded sleep":"日历记录的睡眠"}</h3>{recorded.map(record=><article className={styles.episode} key={record.id}><strong>{duration(record.durationMinutes)}</strong><p>{time(record.startAt,EVAORBIT_TIME_ZONE)} — {time(record.endAt,EVAORBIT_TIME_ZONE)}</p><small>{english?"Calendar record · no device measurement":"日历记录 · 无设备测量"}</small>{record.notes&&<p className={styles.notes}>{record.notes}</p>}</article>)}</div>}
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
