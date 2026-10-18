"use client";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "@/components/locale-controller";
import { ToastNotice } from "@/components/action-toast";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft2, Clock, Refresh, Save, Sunrise } from "reicon-react";
import styles from "./life-day-settings.module.css";

export function LifeDaySettings() {
  const { english } = useLocale();
  const [time, setTime] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    return fetch("/api/preferences/life-day", { cache: "no-store" }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(value => {
      setError("");
      setTime(value.fallbackTime); setSaved(value.fallbackTime);
    }).catch(() => setError(english ? "Could not load life-day settings. Please retry." : "读取生活日设置失败，请重试。"));
  }, [english]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !time) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/preferences/life-day", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fallbackTime: time }) });
      if (!response.ok) throw new Error();
      const value = await response.json();
      setTime(value.fallbackTime); setSaved(value.fallbackTime);
      setNotice(english ? "Life-day settings saved." : "生活日设置已保存。");
    } catch { setError(english ? "Could not save. Please retry." : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }

  return <div className="page settings-detail-page">
    <PageHeader eyebrow="" title={<span className={styles.iconLabel}><Sunrise size={32} weight="Outline" aria-hidden="true" />{english ? "Life day" : "生活日"}</span>} action={<Link className={`settings-back-link ${styles.iconLabel}`} href="/settings"><ArrowLeft2 size={16} weight="Outline" aria-hidden="true" />{english ? "All settings" : "全部设置"}</Link>} />
    <section className="provider-card appearance-theme-settings" aria-labelledby="life-day-heading">
    <div className="persona-heading"><h2 id="life-day-heading">{english ? "Day boundary" : "切换规则"}</h2></div>
    <p id="life-day-help">{english ? "Recurring tasks follow your main sleep and wake time. When sleep is unavailable, the day changes at the time below. Changes apply to future completions; recorded history stays unchanged." : "循环任务优先按主睡眠的醒来时间切换生活日；没有睡眠记录时，使用下方时间。修改后用于后续完成计算，已记录的历史保持不变。"}</p>
    <form className="appearance-setting-group" onSubmit={save}>
      <label className="field"><span className={styles.iconLabel}><Clock size={16} weight="Outline" aria-hidden="true" />{english ? "Day changes at (without sleep)" : "无睡眠记录时的切换时间"}</span><input type="time" required step={60} value={time} disabled={!saved || saving} onChange={event => setTime(event.target.value)} aria-describedby="life-day-help" /></label>
      {!saved && !error && <PageLoading title="设置" englishTitle="settings" compact />}
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      {!saved && error ? <button type="button" className="button" onClick={() => void load()}><Refresh size={16} weight="Outline" aria-hidden="true" />{english ? "Retry" : "重试"}</button> : <button className="button primary" disabled={!saved || !time || saving || time === saved}><Save size={16} weight="Outline" aria-hidden="true" />{saving ? english ? "Saving…" : "保存中…" : english ? "Save" : "保存"}</button>}
    </form>
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    </section>
  </div>;
}
