"use client";
import type {ComponentType, ReactNode} from "react";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {Icon} from "@/components/icons";
import {PageHeading as PageHeader} from "@/components/page-heading";
import {dateInEvaOrbit,EVAORBIT_TIME_ZONE} from "@/lib/time";
import {foodRecordDisplay} from "@/lib/food-record-display";
import {drinkRecordName} from "@/lib/drink-display";
import type {FoodDrinkHomeData} from "@/lib/food-drink-insights";
import type {FoodLog,DrinkLog,DrinkLimit} from "@/lib/types";
import {limitStateLabels,limitPeriodLabels} from "@/lib/drink-limit-labels";
import styles from "@/app/food-drink/food-drink.module.css";
export type FoodDrinkLinkProps={href:string;children:ReactNode};
export type FoodDrinkRecord={kind:"food";record?:FoodLog}|{kind:"drink";record?:DrinkLog};
export function FoodDrinkRecordChoices({onChoose}:{onChoose:(record:FoodDrinkRecord)=>void}){
  return <div className={styles.recordChoices}><button onClick={()=>onChoose({kind:"food"})}><Icon name="food"/><span><strong>Record food</strong><small>记录一餐、加餐或包装食品</small></span></button><button onClick={()=>onChoose({kind:"drink"})}><Icon name="drink"/><span><strong>Record drink</strong><small>记录饮品、糖度、冷热与容量</small></span></button></div>;
}
const destinations = [
  { href: "/food", label: "Food records", icon: "food" as const },
  { href: "/drinks/history", label: "Drink records", icon: "drink" as const },
  { href: "/food/places", label: "Places", icon: "foodPlaces" as const },
  { href: "/food/library", label: "Library", icon: "foodLibrary" as const },
];
const severity = { exceeded_limit: 3, reached_limit: 2, near_limit: 1, within_limit: 0 };


export function FoodDrinkHomeView({data,loading,error,onRetry,onRecord,onLimit,LinkComponent:Link,action,readOnly=false}:{data:FoodDrinkHomeData|null;loading:boolean;error:string;onRetry:()=>void;onRecord:(value:FoodDrinkRecord)=>void;onLimit:(value:DrinkLimit|"new")=>void;LinkComponent:ComponentType<FoodDrinkLinkProps>;action?:ReactNode;readOnly?:boolean}) {
  const latest = data?.brief.latest;
  const latestTitle = latest ? latest.kind === "food" ? foodRecordDisplay(latest.record).title : drinkRecordName(latest.record) : "";
  const warning = data?.limitStatuses.filter(status => status.state !== "within_limit").sort((a, b) => severity[b.state] - severity[a.state])[0];
  const latestDay = latest ? dateInEvaOrbit(new Date(latest.record.occurredAt)) : "";
  const latestTime = latest?.record.occurredHasExplicitTime === false ? "仅日期" : latest ? new Date(latest.record.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: EVAORBIT_TIME_ZONE }) : "";
  const ready = !error && data;
  return <div className={`page ${styles.page}`}>
    <PageHeader eyebrow="生活" title="Food & Drink" action={action} />
    <nav className={styles.destinations} aria-label="Food & Drink 核心入口">{destinations.map(destination => <Link href={destination.href} key={destination.href}><Icon name={destination.icon} variant="feature" /><span>{destination.label}</span></Link>)}</nav>
    {loading && !data ? <PageLoading title="饮食" englishTitle="food and drink" inline /> : <><section className={styles.brief} aria-labelledby="brief-title"><h2 id="brief-title">Brief</h2>
      {error ? <ErrorNotice role="alert">{error} <button className="text-button" onClick={onRetry}>重试</button></ErrorNotice> : loading && !data ? <PageLoading title="饮食简报" englishTitle="food and drink brief" inline /> : data && <>
        <p className={styles.briefLead}>{readOnly&&data.date!==dateInEvaOrbit()?`${data.date} · ${data.brief.foodCount} food records · ${data.brief.drinkCount} drinks`:<>今天吃了 {data.brief.foodCount} 次，喝了 {data.brief.drinkCount} 杯。</>}</p>
        {latest ? <p className={styles.latest}>最近一条：{latestDay === data.date&&(!readOnly||data.date===dateInEvaOrbit()) ? "今天" : latestDay}{latest.record.occurredHasExplicitTime === false ? "（仅日期）" : ` ${latestTime}`}，{latest.kind === "food" ? "吃了" : "喝了"}「<button className={`${styles.latestLink} user-content`} onClick={() => onRecord(latest.kind === "food" ? { kind: "food", record: latest.record } : { kind: "drink", record: latest.record })} aria-label={`${readOnly ? "View" : "编辑最近记录"} ${latestTitle}`}>{latestTitle}</button>」。</p> : <p className={styles.hint}>还没有记录，从第一餐或第一杯开始。</p>}
        {warning ? <button className={styles.briefWarning} disabled={readOnly} onClick={() => onLimit(warning.limit)}><span className="user-content">{warning.limit.name}</span> · {limitStateLabels[warning.state]} </button> : <p className={styles.hint}>{data.limitStatuses.length ? "当前限额均在范围内。" : "当前没有启用中的限额。"}</p>}
      </>}
    </section>
    <section className={styles.insights} aria-labelledby="insights-title"><div className="section-heading"><h2 id="insights-title">Insights</h2></div>
      {ready ? <>{!data.window.complete && <p className={styles.hint}>记录较多，仅展示已读取内容的代表性模式，暂停前后比较。</p>}{data.insights.length ? <ol className={styles.insightList}>{data.insights.map(insight => <li key={insight.id}><h3>{insight.href ? <Link href={insight.href}>{insight.title}</Link> : insight.title}</h3><p>{insight.body}</p></li>)}</ol> : <p className={styles.insightEmpty}>近期还没有足够记录形成有代表性的模式。先记下来，有值得注意的变化再放在这里。</p>}</> : error ? <p className={styles.hint}>重新加载后查看近期洞察。</p> : <PageLoading title="近期洞察" englishTitle="insights" inline />}
    </section>
    <section id="limits" className={styles.limits} aria-labelledby="limits-title"><div className="section-heading"><h2 id="limits-title">Limits</h2><button className="text-button" disabled={readOnly} onClick={() => onLimit("new")}>设置限额</button></div>
      {ready ? data.limits.length ? <div className={styles.limitList}>{data.limits.map(limit => {
        const status = data.limitStatuses.find(item => item.limit.id === limit.id);
        return <button className={styles.limit} key={limit.id} data-state={limit.enabled ? status?.state : "disabled"} disabled={readOnly} onClick={() => onLimit(limit)} aria-label={`编辑限额 ${limit.name}`}><span><strong className="user-content">{limit.name}</strong><small>{limitPeriodLabels[limit.period]} · {limit.enabled ? status ? limitStateLabels[status.state] : "—" : "已停用"}</small></span><span className={styles.limitCount}>{limit.enabled && status ? `${status.count} / ${limit.limitValue}` : `— / ${limit.limitValue}`}</span><Icon name="edit" /></button>;
      })}</div> : <p className={styles.hint}>还没有限额，可以为常喝的饮品设一条数量线。</p> : error ? <p className={styles.hint}>重新加载后查看限额。</p> : <PageLoading title="限额" englishTitle="limits" inline />}
    </section>
    </>}
  </div>;
}
