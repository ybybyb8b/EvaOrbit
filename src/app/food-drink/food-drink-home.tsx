"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { FormSheet } from "@/components/form-sheet";
import { dateInEvaOrbit } from "@/lib/time";
import { foodDrinkOverview } from "@/lib/food-drink-timeline";
import type { DailyNutritionSummary, DrinkLog, FoodLog, DrinkInputSuggestions, DrinkLimitStatus, DrinkPreferenceSummary, FoodPlace } from "@/lib/types";
import { FoodRecordEditor } from "../food/food-record-editor";
import { DrinkRecordEditor } from "../drinks/drink-ui";
import { RecordTimeline } from "./record-timeline";
import styles from "./food-drink.module.css";

type Editor = { kind: "choose" } | { kind: "food"; record?: FoodLog } | { kind: "drink"; record?: DrinkLog } | null;
const destinations = [
  { href: "/food", label: "Food records", detail: "餐次、份量与饮食场景", icon: "food" as const },
  { href: "/drinks/history", label: "Drink records", detail: "糖度、冷热与每一杯", icon: "drink" as const },
  { href: "/food/places", label: "Places", detail: "共用的饮食来源库", icon: "people" as const },
  { href: "/food/library", label: "Library", detail: "食品与包装营养参考", icon: "memory" as const },
];

export function FoodDrinkHome() {
  const [date, setDate] = useState(() => dateInEvaOrbit());
  const [foods, setFoods] = useState<FoodLog[]>([]), [drinks, setDrinks] = useState<DrinkLog[]>([]);
  const [nutrition, setNutrition] = useState<DailyNutritionSummary | null>(null);
  const [limits, setLimits] = useState<DrinkLimitStatus[]>([]), [preferences, setPreferences] = useState<DrinkPreferenceSummary | null>(null), [places, setPlaces] = useState<FoodPlace[]>([]);
  const [suggestions, setSuggestions] = useState<DrinkInputSuggestions>({ names: [], brands: [] });
  const [editor, setEditor] = useState<Editor>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const urls = [`/api/food/logs?date=${date}`, `/api/drinks/logs?date=${date}`, `/api/nutrition/daily?date=${date}`, "/api/drinks/limits?status=1", "/api/drinks/preferences", "/api/food/places?limit=200"];
      const responses = await Promise.all(urls.map(url => fetch(url, { signal })));
      if (responses.some(response => !response.ok)) throw new Error("饮食数据加载失败，请重试");
      const [foodRows, drinkRows, summary, limitRows, preferenceRows, placeRows] = await Promise.all(responses.map(response => response.json()));
      if (signal?.aborted) return;
      setFoods(foodRows); setDrinks(drinkRows); setNutrition(summary); setLimits(limitRows); setPreferences(preferenceRows); setPlaces(placeRows);
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "饮食数据加载失败"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [date]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  async function openDrink(record?: DrinkLog) {
    setEditor({ kind: "drink", record });
    try { const response = await fetch("/api/drinks/suggestions"); if (response.ok) setSuggestions(await response.json()); } catch { /* Optional historical suggestions. */ }
  }
  const overview = foodDrinkOverview(foods, drinks);
  const recentPlaces = places.filter(place => place.lastVisitedAt).sort((a, b) => b.lastVisitedAt!.localeCompare(a.lastVisitedAt!)).slice(0, 3);
  const today = date === dateInEvaOrbit();
  return <div className={`page ${styles.page}`}>
    <PageHeader eyebrow="生活" title="Food & Drink" description="吃过的、喝过的，放在一起看。" action={<button className="button primary" onClick={() => setEditor({ kind: "choose" })}><Icon name="plus" />新增记录</button>} />
    <nav className={styles.destinations} aria-label="Food & Drink 子功能">{destinations.map(destination => <Link href={destination.href} key={destination.href}><Icon name={destination.icon} /><span><strong>{destination.label}</strong><small>{destination.detail}</small></span><Icon name="arrow" variant="stroke" /></Link>)}</nav>
    <section className={styles.overview} aria-labelledby="intake-title"><div className={styles.overviewHeading}><h2 id="intake-title">{today ? "今日概览" : "当天概览"}</h2><input aria-label="概览日期" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></div>
      {error ? <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => void load()}>重试</button></p> : loading ? <p role="status">正在读取当天记录…</p> : <><div className={styles.metrics}><div className={styles.energy}><span>Food + Drink 摄入估算</span><strong>{foods.length + drinks.length === 0 || overview.unestimated === foods.length + drinks.length ? "—" : nutrition ? nutrition.intakeMin === nutrition.intakeMax ? `约 ${nutrition.intakeMin}` : `${nutrition.intakeMin}–${nutrition.intakeMax}` : "—"}<small> kcal</small></strong></div><div><span>餐次 / 加餐</span><strong>{overview.meals}<small> 次</small></strong></div><div><span>饮品</span><strong>{overview.drinks}<small> 杯</small></strong></div></div><p className={styles.hint}>{overview.unestimated > 0 ? `${overview.unestimated} 条记录尚未估算热量；当前合计仅包含已估算部分。` : foods.length + drinks.length > 0 ? `估算可信度：${nutrition?.confidence === "high" ? "高" : nutrition?.confidence === "medium" ? "中" : "低"}。` : "记下第一餐或第一杯，概览会随记录更新。"}</p></>}
    </section>
    <section className={styles.day}><div className="section-heading"><h2>{today ? "今日时间线" : "当天时间线"}</h2><span className={styles.hint}>{loading || error ? "" : `${foods.length + drinks.length} 条记录`}</span></div>{loading ? <p className={styles.hint}>正在读取时间线…</p> : error ? <p className={styles.hint}>重新加载后查看当天时间线。</p> : foods.length + drinks.length ? <RecordTimeline foods={foods} drinks={drinks} onFood={record => setEditor({ kind: "food", record })} onDrink={record => void openDrink(record)} /> : <div className="empty-state compact-empty"><h3>这一天还没有饮食记录</h3><p>从上方「新增记录」选择 Food 或 Drink。</p></div>}</section>
    <section className={styles.insights} aria-labelledby="insights-title"><div className="section-heading"><h2 id="insights-title">习惯与数量线</h2><Link className="text-button" href="/drinks#limits">饮品设置 <Icon name="arrow" /></Link></div>{loading ? <p className={styles.hint}>正在读取习惯与限额…</p> : error ? <p className={styles.hint}>重新加载后查看习惯与限额。</p> : <div className={styles.insightGrid}>
      <div><h3>饮品限额</h3><p className={styles.hint}>以下限额按当前日期计算，不随概览日期变化。</p>{limits.length ? limits.map(status => <Link className={styles.limit} href="/drinks#limits" key={status.limit.id} data-warning={status.state !== "within_limit"}><span>{status.limit.name}<small>{status.limit.period === "daily" ? "今天" : status.limit.period === "weekly" ? "本周" : "本月"} · {status.state === "exceeded_limit" ? "已超过" : status.state === "reached_limit" ? "已到上限" : status.state === "near_limit" ? "接近上限" : "范围内"}</small></span><strong>{status.count}<small> / {status.limit.limitValue}</small></strong></Link>) : <p className={styles.hint}>{loading ? "正在读取限额…" : "暂未设置饮品限额"}</p>}</div>
      <div><h3>饮食足迹</h3><p className={styles.footprint}>当天外食 / 外卖 <strong>{error || loading ? "—" : overview.outsideMeals} <small>条记录</small></strong></p>{preferences?.commonDrinks.length ? <p className={styles.hint}>常喝：{preferences.commonDrinks.slice(0, 2).map(item => `${item.name}（${item.count} 次）`).join(" · ")}</p> : <p className={styles.hint}>记录多一些后，这里会出现常喝的饮品。</p>}<h4>最近来源</h4>{recentPlaces.length ? recentPlaces.map(place => <Link className={styles.source} href={`/food/places/${place.id}`} key={place.id}><span>{place.name}</span><small>累计 {place.frequency ?? place.visitCount} 次</small></Link>) : <p className={styles.hint}>关联来源后，可以从这里回到 Places。</p>}</div>
    </div>}</section>
    {editor?.kind === "choose" && <FormSheet title="新增记录" onClose={() => setEditor(null)}><div className={styles.recordChoices}><button onClick={() => setEditor({ kind: "food" })}><Icon name="food" /><span><strong>Record food</strong><small>记录一餐、加餐或包装食品</small></span><Icon name="arrow" variant="stroke" /></button><button onClick={() => void openDrink()}><Icon name="drink" /><span><strong>Record drink</strong><small>记录饮品、糖度、冷热与容量</small></span><Icon name="arrow" variant="stroke" /></button></div></FormSheet>}
    {editor?.kind === "food" && <FoodRecordEditor date={date} record={editor.record} onClose={() => setEditor(null)} onSaved={load} onDeleted={load} />}
    {editor?.kind === "drink" && <DrinkRecordEditor initialDate={date} record={editor.record} suggestions={suggestions} onClose={() => setEditor(null)} onSaved={load} onDeleted={load} />}
  </div>;
}
