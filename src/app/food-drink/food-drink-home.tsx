"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { FormSheet } from "@/components/form-sheet";
import { dateInEvaOrbit, EVAORBIT_TIME_ZONE } from "@/lib/time";
import { foodRecordDisplay } from "@/lib/food-record-display";
import { drinkRecordName } from "@/lib/drink-display";
import type { FoodDrinkHomeData } from "@/lib/food-drink-insights";
import type { DrinkLog, FoodLog, DrinkInputSuggestions, DrinkLimit } from "@/lib/types";
import { FoodRecordEditor } from "../food/food-record-editor";
import { DrinkRecordEditor } from "../drinks/drink-ui";
import { LimitEditor, limitStateLabels, limitPeriodLabels } from "./limit-editor";
import styles from "./food-drink.module.css";

type Editor = { kind: "choose" } | { kind: "food"; record?: FoodLog } | { kind: "drink"; record?: DrinkLog } | null;
const destinations = [
  { href: "/food", label: "Food records", icon: "food" as const },
  { href: "/drinks/history", label: "Drink records", icon: "drink" as const },
  { href: "/food/places", label: "Places", icon: "foodPlaces" as const },
  { href: "/food/library", label: "Library", icon: "foodLibrary" as const },
];
const severity = { exceeded_limit: 3, reached_limit: 2, near_limit: 1, within_limit: 0 };

export function FoodDrinkHome({ initialRecord }: { initialRecord?: "food" | "drink" }) {
  const [data, setData] = useState<FoodDrinkHomeData | null>(null);
  const [suggestions, setSuggestions] = useState<DrinkInputSuggestions>({ names: [], brands: [] });
  const [editor, setEditor] = useState<Editor>(initialRecord ? { kind: initialRecord } : null);
  const [limitEditor, setLimitEditor] = useState<DrinkLimit | "new" | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/food-drink/home", { signal });
      if (!response.ok) throw new Error("饮食简报加载失败，请重试");
      const next = await response.json() as FoodDrinkHomeData;
      if (!signal?.aborted) setData(next);
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "饮食简报加载失败"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  useEffect(() => {
    if (editor?.kind !== "drink") return;
    const controller = new AbortController();
    void fetch("/api/drinks/suggestions", { signal: controller.signal }).then(async response => { if (response.ok && !controller.signal.aborted) setSuggestions(await response.json()); }).catch(() => { /* Suggestions are optional. */ });
    return () => controller.abort();
  }, [editor?.kind]);
  const latest = data?.brief.latest;
  const latestTitle = latest ? latest.kind === "food" ? foodRecordDisplay(latest.record).title : drinkRecordName(latest.record) : "";
  const warning = data?.limitStatuses.filter(status => status.state !== "within_limit").sort((a, b) => severity[b.state] - severity[a.state])[0];
  const latestDay = latest ? dateInEvaOrbit(new Date(latest.record.occurredAt)) : "";
  const latestTime = latest?.record.occurredHasExplicitTime === false ? "仅日期" : latest ? new Date(latest.record.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: EVAORBIT_TIME_ZONE }) : "";
  const ready = !loading && !error && data;
  return <div className={`page ${styles.page}`}>
    <PageHeader eyebrow="生活" title="Food & Drink" action={<button className="button primary" onClick={() => setEditor({ kind: "choose" })}><Icon name="plus" />新增记录</button>} />
    <section className={styles.brief} aria-labelledby="brief-title"><h2 id="brief-title">Brief</h2>
      {error ? <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => void load()}>重试</button></p> : loading ? <p className={styles.hint} role="status">正在读取饮食简报…</p> : data && <>
        <p className={styles.briefLead}>今天吃了 <strong>{data.brief.foodCount}</strong> 次，喝了 <strong>{data.brief.drinkCount}</strong> 杯。</p>
        {latest ? <button className={styles.latest} onClick={() => setEditor(latest.kind === "food" ? { kind: "food", record: latest.record } : { kind: "drink", record: latest.record })} aria-label={`编辑最近记录 ${latestTitle}`}><span>最近一条 · {latest.kind === "food" ? "Food" : "Drink"}</span><strong className="user-content">{latestTitle}</strong><small>{latestDay === data.date ? "今天" : latestDay} · {latestTime}</small></button> : <p className={styles.hint}>还没有记录，从第一餐或第一杯开始。</p>}
        {warning ? <button className={styles.briefWarning} onClick={() => setLimitEditor(warning.limit)}><span className="user-content">{warning.limit.name}</span> · {limitStateLabels[warning.state]} <Icon name="arrow" /></button> : <p className={styles.hint}>{data.limitStatuses.length ? "当前限额均在范围内。" : "当前没有启用中的限额。"}</p>}
      </>}
    </section>
    <nav className={styles.destinations} aria-label="Food & Drink 核心入口">{destinations.map(destination => <Link href={destination.href} key={destination.href}><Icon name={destination.icon} variant="feature" /><span>{destination.label}</span></Link>)}</nav>
    <section className={styles.insights} aria-labelledby="insights-title"><div className="section-heading"><h2 id="insights-title">Insights</h2></div>
      {ready ? <>{!data.window.complete && <p className={styles.hint}>记录较多，仅展示已读取内容的代表性模式，暂停前后比较。</p>}{data.insights.length ? <ol className={styles.insightList}>{data.insights.map(insight => <li key={insight.id}><h3>{insight.href ? <Link href={insight.href}>{insight.title}<Icon name="arrow" /></Link> : insight.title}</h3><p>{insight.body}</p></li>)}</ol> : <p className={styles.insightEmpty}>近期还没有足够记录形成有代表性的模式。先记下来，有值得注意的变化再放在这里。</p>}</> : <p className={styles.hint}>{error ? "重新加载后查看近期洞察。" : "正在整理近期模式…"}</p>}
    </section>
    <section id="limits" className={styles.limits} aria-labelledby="limits-title"><div className="section-heading"><h2 id="limits-title">Limits</h2><button className="text-button" onClick={() => setLimitEditor("new")}>设置限额</button></div>
      {ready ? data.limits.length ? <div className={styles.limitList}>{data.limits.map(limit => {
        const status = data.limitStatuses.find(item => item.limit.id === limit.id);
        return <button className={styles.limit} key={limit.id} data-state={limit.enabled ? status?.state : "disabled"} onClick={() => setLimitEditor(limit)} aria-label={`编辑限额 ${limit.name}`}><span><strong className="user-content">{limit.name}</strong><small>{limitPeriodLabels[limit.period]} · {limit.enabled ? status ? limitStateLabels[status.state] : "读取中" : "已停用"}</small></span><span className={styles.limitCount}>{limit.enabled && status ? `${status.count} / ${limit.limitValue}` : `— / ${limit.limitValue}`}</span><Icon name="edit" /></button>;
      })}</div> : <p className={styles.hint}>还没有限额，可以为常喝的饮品设一条数量线。</p> : <p className={styles.hint}>{error ? "重新加载后查看限额。" : "正在读取限额…"}</p>}
    </section>
    {limitEditor && <LimitEditor limit={limitEditor === "new" ? undefined : limitEditor} onClose={() => setLimitEditor(null)} onSaved={load} />}
    {editor?.kind === "choose" && <FormSheet title="新增记录" onClose={() => setEditor(null)}><div className={styles.recordChoices}><button onClick={() => setEditor({ kind: "food" })}><Icon name="food" /><span><strong>Record food</strong><small>记录一餐、加餐或包装食品</small></span><Icon name="arrow" variant="stroke" /></button><button onClick={() => setEditor({ kind: "drink" })}><Icon name="drink" /><span><strong>Record drink</strong><small>记录饮品、糖度、冷热与容量</small></span><Icon name="arrow" variant="stroke" /></button></div></FormSheet>}
    {editor?.kind === "food" && <FoodRecordEditor date={data?.date ?? dateInEvaOrbit()} record={editor.record} onClose={() => setEditor(null)} onSaved={load} onDeleted={load} />}
    {editor?.kind === "drink" && <DrinkRecordEditor initialDate={data?.date ?? dateInEvaOrbit()} record={editor.record} suggestions={suggestions} onClose={() => setEditor(null)} onSaved={load} onDeleted={load} />}
  </div>;
}
