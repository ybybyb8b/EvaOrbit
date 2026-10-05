"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/locale-controller";
import { SleepSummary } from "@/components/sleep-summary";
import { subscribeDataChanged } from "@/lib/data-changed";
import type { DailySleepSummary } from "@/lib/sleep";

export function SleepSection({ initial }: { initial: DailySleepSummary }) {
  const { english } = useLocale();
  const [summary, setSummary] = useState(initial);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/health/sleep?date=${encodeURIComponent(summary.date)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setSummary(await response.json() as DailySleepSummary);
      setError(false);
    } catch { setError(true); }
  }, [summary.date]);
  useEffect(() => subscribeDataChanged(["health", "calendar"], () => { void refresh(); }), [refresh]);
  return <section className="health-section health-sleep-section" aria-labelledby="health-sleep-title">
    <div className="section-heading"><div><h2 id="health-sleep-title">{english ? "Sleep" : "睡眠"}</h2><p>{summary.date} · {english ? "Wake date" : "醒来的日期"}</p></div><button className="text-button" onClick={() => void refresh()}>{english ? "Refresh" : "刷新"}</button></div>
    <SleepSummary summary={summary} english={english} />
    {error && <p className="form-error" role="status">{english ? "Could not refresh sleep. Try Refresh again." : "睡眠数据刷新失败，请再次点击刷新。"}</p>}
  </section>;
}
