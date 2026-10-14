"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BottomLogScope } from "@/components/bottom-log";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { SleepSummary } from "@/components/sleep-summary";
import { homeDurationLabel } from "@/lib/home-day";
import { sleepDisplay } from "@/lib/sleep";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { Icon } from "@/components/icons";
import styles from "./sleep-section.module.css";
import { subscribeDataChanged } from "@/lib/data-changed";
import type { DailySleepSummary } from "@/lib/sleep";

export function SleepSection({ initial }: { initial: DailySleepSummary }) {
  const { english } = useLocale();
  const [summary, setSummary] = useState(initial);
  const [error, setError] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/health/sleep?date=${encodeURIComponent(summary.date)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setSummary(await response.json() as DailySleepSummary);
      setError(false);
    } catch { setError(true); }
  }, [summary.date]);
  useEffect(() => subscribeDataChanged(["health", "calendar"], () => { void refresh(); }), [refresh]);
  const display = sleepDisplay(summary);
  const zone = display && "timeZone" in display ? display.timeZone : EVAORBIT_TIME_ZONE;
  const clock = (value: string) => new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(value));
  const duration = (minutes: number) => homeDurationLabel(Math.round(minutes), english);
  return <section className="health-section health-sleep-section" aria-labelledby="health-sleep-title">
    <BottomLogScope label={english ? "Sleep data sources" : "睡眠数据来源"} onClick={() => setSourcesOpen(true)} />
    {sourcesOpen && <FormSheet title={english ? "Sleep data sources" : "睡眠数据来源"} onClose={() => setSourcesOpen(false)}><div className="editor-card"><p>{english ? "Measured sleep comes from Apple Health. Sleep windows come from 3×3 or Apple Calendar. Manage the original records in those apps; EO reads and displays them here." : "实际睡眠来自 Apple 健康，睡眠窗口来自 3×3 或 Apple Calendar。请在对应应用管理原始记录，EO 会读取并展示。"}</p><div className="form-grid"><Link className="button secondary" href="/settings/health-native">{english ? "Apple Health & sync" : "Apple 健康与同步设置"}</Link><Link className="button secondary" href="/settings/apple-integration">{english ? "Calendar connection" : "日历连接与权限"}</Link></div></div></FormSheet>}
    <div className={`section-heading ${styles.dateHeading}`}><div><h2 id="health-sleep-title">{english ? "Daily sleep" : "当日睡眠"}</h2><p>{summary.date} · {english ? "Wake date" : "醒来日期"}</p></div><button className="text-button" onClick={() => void refresh()}>{english ? "Refresh" : "刷新"}</button></div>
    <div className={styles.main}>
      {display ? <>
        <div className={styles.duration}><span>{summary.actual ? english ? "Main sleep · measured" : "主睡眠 · 实测" : english ? "Sleep window · estimated" : "睡眠窗口 · 估算"}</span><strong>{duration(display.durationMinutes)}</strong></div>
        <dl className={styles.times}><div><dt>{summary.actual ? english ? "Fell asleep" : "入睡" : english ? "Window start" : "窗口开始"}</dt><dd>{clock(display.startAt)}</dd></div><div><dt>{summary.actual ? english ? "Woke up" : "醒来" : english ? "Window end" : "窗口结束"}</dt><dd>{clock(display.endAt)}</dd></div></dl>
        {summary.actual && summary.secondary.length > 0 && <p className={styles.other}><span>{english ? "Other sleep" : "其他睡眠"} {duration(summary.napMinutes)}</span><span>{english ? "Total measured" : "实测合计"} {duration(summary.actual.durationMinutes + summary.napMinutes)}</span></p>}
        {!summary.actual && <p className={styles.note}>{english ? "Measured sleep has not synced for this wake date. This window comes from Timeline." : "这个醒来日期的实际睡眠尚未同步，当前显示时间线估算窗口。"}</p>}
      </> : <div className={styles.empty}><strong>{english ? "No sleep data for this day" : "这一天暂无睡眠数据"}</strong><p>{english ? "Measured sleep has not synced for this wake date. Check the date or refresh after syncing." : "尚未收到这个醒来日期的实际睡眠，请核对日期或同步后刷新。"}</p></div>}
    </div>
    <details className={styles.details}><summary><span>{english ? "Sleep details & data sources" : "睡眠明细与数据来源"}</span><Icon name="chevronDown" /></summary><div className={styles.detailsBody}><SleepSummary summary={summary} english={english} /></div></details>
    {error && <p className="form-error" role="status">{english ? "Could not refresh sleep. Try Refresh again." : "睡眠数据刷新失败，请再次点击刷新。"}</p>}
  </section>;
}
