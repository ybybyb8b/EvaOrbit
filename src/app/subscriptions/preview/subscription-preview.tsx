"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import type { Subscription, SubscriptionPayment, SubscriptionStatus } from "@/lib/types";
import { subscriptionBrand, subscriptionPreviewStats } from "@/lib/subscription-preview";
import styles from "./preview.module.css";
import { useIconColors } from "./use-icon-colors";

const money = (amount: number, currency: string, english: boolean) => new Intl.NumberFormat(english ? "en-US" : "zh-CN", { style: "currency", currency }).format(amount / 100);
const tones = ["var(--accent-primary)", "var(--accent-gold)", "var(--text-secondary)", "var(--accent-strong)", "var(--text-primary)"];
const tone = (index: number) => ({ "--preview-tone": tones[index % tones.length] }) as CSSProperties;

export function SubscriptionPreview({ items, payments, today, iconSources, onCreate }: { items: Subscription[]; payments: SubscriptionPayment[]; today: string; iconSources?: Record<number, string>; onCreate?: () => void }) {
  const { english } = useLocale();
  const [view, setView] = useState<"home" | "trends">("home");
  const [status, setStatus] = useState<"all" | SubscriptionStatus>("all");
  const [focused, setFocused] = useState(0);
  const [currency, setCurrency] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const rail = useRef<HTMLDivElement>(null);
  // Preview-only image sources; does not invent an icon field in the subscription model.
  const sources = useMemo(() => Object.fromEntries(items.flatMap(item => {
    const source = iconSources?.[item.id] ?? subscriptionBrand(item.name)?.icon;
    return source ? [[item.id, source]] : [];
  })), [items, iconSources]);
  const { colors, palette, neutralFilter } = useIconColors(sources);
  const stats = useMemo(() => subscriptionPreviewStats(items, payments, today), [items, payments, today]);
  const selectedCurrency = currency || stats.currencies[0] || "CNY";
  const active = items.filter(item => item.status === "active");
  const featured = [...items].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.nextRenewalOn.localeCompare(b.nextRenewalOn) || a.id - b.id);
  const visible = featured.filter(item => status === "all" || item.status === status);
  const dotStart = Math.max(0, Math.min(focused - 2, featured.length - 5));
  const parts = stats.breakdown(month, selectedCurrency);
  const total = stats.actual[month]?.[selectedCurrency] ?? 0;
  const max = Math.max(1, stats.expected[selectedCurrency] ?? 0, ...stats.months.map(key => stats.actual[key][selectedCurrency] ?? 0));
  const t = (en: string, zh: string) => english ? en : zh;
  const date = (value: string, short = false) => new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { month: "short", day: "numeric", ...(short ? {} : { year: "numeric" as const }), timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const monthLabel = (key: string, long = false) => new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { month: long ? "long" : "short", ...(long ? { year: "numeric" as const } : {}), timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`));
  const cycle = (item: Subscription) => english ? `${item.billingIntervalValue === 1 ? "" : `${item.billingIntervalValue} `}${item.billingIntervalUnit}${item.billingIntervalValue === 1 ? "" : "s"}` : `每${item.billingIntervalValue === 1 ? "" : item.billingIntervalValue}${({ day: "天", week: "周", month: "月", year: "年" }[item.billingIntervalUnit])}`;
  const statusLabel = (value: "all" | SubscriptionStatus) => ({ all: t("All", "全部"), active: t("Active", "进行中"), paused: t("Paused", "已暂停"), ended: t("Ended", "已结束") }[value]);
  const totals = (values: Record<string, number>) => stats.currencies.length ? stats.currencies.map(key => <span key={key}>{money(values[key] ?? 0, key, english)}</span>) : <span>—</span>;
  const spend = (item: Subscription) => Object.entries(item.spendByCurrency).map(([key, value]) => money(value, key, english)).join(" / ") || t("Not recorded", "尚未记录");
  function mark(item: Subscription) {
    const brand = subscriptionBrand(item.name);
    if (iconSources?.[item.id]) return <span key={iconSources[item.id]} className={styles.brandIcon} aria-hidden="true">
      <b hidden>{item.name.slice(0, 1).toUpperCase()}</b>
      {/* Tiny unoptimized source is also the input to the canvas sampler. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSources[item.id]} alt="" style={colors[item.id] === null ? { filter: neutralFilter } : undefined} ref={node => { if (node?.complete && !node.naturalWidth) { node.style.display = "none"; node.previousElementSibling?.removeAttribute("hidden"); } }} onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.previousElementSibling?.removeAttribute("hidden"); }} />
    </span>;
    return brand ? <span className={styles.brandIcon} aria-hidden="true"><span style={{ maskImage: `url("${brand.icon}")`, WebkitMaskImage: `url("${brand.icon}")`, backgroundColor: ["#000000", "#181717"].includes(brand.color) ? "currentColor" : brand.color }} /></span> : <span className={styles.monogram} aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>;
  }

  function move(index: number) {
    const node = rail.current;
    const card = node?.children[index] as HTMLElement | undefined;
    if (!node || !card) return;
    setFocused(index);
    node.scrollTo({ left: card.offsetLeft - (node.clientWidth - card.offsetWidth) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  function followScroll() {
    const node = rail.current;
    if (!node) return;
    const center = node.scrollLeft + node.clientWidth / 2;
    let nearest = 0, distance = Infinity;
    Array.from(node.children).forEach((child, index) => {
      const card = child as HTMLElement;
      const next = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
      if (next < distance) { nearest = index; distance = next; }
      const progress = Math.max(-1, Math.min(1, (card.offsetLeft + card.offsetWidth / 2 - center) / card.offsetWidth));
      const face = card.firstElementChild as HTMLElement;
      const amount = Math.abs(progress);
      face.style.transform = `translate3d(${-progress * 10}px,${amount * 14}px,0) scale(${1 - amount * .07})`;
      face.style.setProperty("--preview-content-opacity", String(Math.max(0, 1 - amount * 1.8)));
      card.style.zIndex = String(10 - Math.round(amount * 8));
    });
    setFocused(nearest);
  }

  return <div className={`page ${styles.page}`} data-view={view}>
    <header className={styles.header}>
      <h1>{t("Subscriptions", "订阅")}</h1>
      {onCreate && <button className="button primary" onClick={onCreate}><Icon name="plus" />{t("Add", "新增订阅")}</button>}
    </header>
    <div className={styles.switcher} role="group" aria-label={t("Subscriptions view", "订阅视图")}>
      <button aria-pressed={view === "home"} onClick={() => { setFocused(0); setView("home"); }}>{t("Overview", "订阅首页")}</button>
      <button aria-pressed={view === "trends"} onClick={() => setView("trends")}>{t("Trends", "趋势统计")}</button>
    </div>
    <dl className={styles.summary}>
      <div><dt>{t("Active", "进行中")}</dt><dd className={styles.count}>{active.length}<small>{t("subscriptions", "个订阅")}</small></dd></div>
      <div><dt>{t("Expected this month", "本月预计")}</dt><dd>{totals(stats.expected)}</dd></div>
      <div><dt>{t("Paid this month", "本月已付")}</dt><dd>{totals(stats.actual[stats.currentMonth])}</dd></div>
    </dl>
    {view === "home" ? <>
      {featured.length > 0 && <section className={styles.featured} aria-label={t("Subscription carousel", "订阅卡片浏览")} aria-roledescription={t("carousel", "轮播")}>
        <div className={styles.sectionHead}><h2>{t("On the horizon", "即将续费")}</h2><span>{t("Swipe to explore", "左右滑动浏览")}</span></div>
        <div className={styles.rail} ref={rail} onScroll={followScroll} onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const index = Math.max(0, Math.min(featured.length - 1, focused + (event.key === "ArrowRight" ? 1 : -1)));
          move(index);
          (rail.current?.children[index]?.firstElementChild as HTMLElement | undefined)?.focus({ preventScroll: true });
        }}>
          {featured.map((item, index) => { const brand = subscriptionBrand(item.name); const accent = colors[item.id] ?? (iconSources?.[item.id] ? null : brand?.color ?? null); return <div key={item.id} className={styles.slide} data-focused={index === focused}><Link href={`/subscriptions/${item.id}`} className={styles.featureCard} style={{ ...(accent ? { "--preview-tone": accent } as CSSProperties : { "--preview-tone": "var(--accent-primary)" } as CSSProperties), ...palette(accent) }} aria-label={`${item.name}, ${money(item.currentAmountMinor, item.currency, english)}, ${statusLabel(item.status)}, ${date(item.nextRenewalOn)}`}>
            <div className={styles.cardContent}>
              <div className={styles.cardTop}>{mark(item)}<h3 data-no-translate>{item.name}</h3></div>
              <strong className={styles.cardPrice}>{money(item.currentAmountMinor, item.currency, english)}</strong>
              <div className={styles.cardBottom}><small>{cycle(item)}</small><div><small>{item.status === "active" ? t("Next renewal", "下次续费") : statusLabel(item.status)}</small><span>{item.status === "active" ? date(item.nextRenewalOn, true) : t("No scheduled charge", "暂无续费计划")}</span></div></div>
            </div>
          </Link></div>; })}
        </div>
        {featured.length > 1 && <div className={styles.railControls} role="group" aria-label={t("Select a subscription", "选择订阅卡片")}>
          {featured.slice(dotStart, dotStart + 5).map((item, offset) => <button key={item.id} aria-label={t(`Show ${item.name}`, `查看 ${item.name}`)} aria-pressed={focused === dotStart + offset} onClick={() => move(dotStart + offset)}><i /></button>)}
        </div>}
      </section>}
      <section className={styles.ledger}>
        <div className={styles.sectionHead}><h2>{t("Your ledger", "订阅账簿")}</h2><span>{visible.length} {t("subscriptions", "个订阅")}</span></div>
        <div className={styles.filters} role="group" aria-label={t("Subscription status", "订阅状态")}>{(["all", "active", "paused", "ended"] as const).map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{statusLabel(value)}</button>)}</div>
        {visible.length ? <div className={styles.list}>{visible.map(item => <Link key={item.id} href={`/subscriptions/${item.id}`} className={styles.row}>
          {mark(item)}<div className={styles.rowCopy}><div className={styles.rowHead}><h3 data-no-translate>{item.name}</h3><span data-status={item.status}>{statusLabel(item.status)}</span></div><p>{cycle(item)} · {item.status === "active" ? t("Next", "下次") : t("Scheduled", "原计划")} {date(item.nextRenewalOn, true)}</p></div><strong className={styles.rowAmount}>{money(item.currentAmountMinor, item.currency, english)}</strong><span className={styles.rowSpend} title={`${t("Spent", "累计")} ${spend(item)}`}>{t("Spent", "累计")} {spend(item)}</span>
        </Link>)}</div> : <div className={styles.empty}><Icon name="calendar" /><h3>{t("A quiet ledger", "安静的账簿")}</h3><p>{items.length ? t("No subscriptions with this status.", "这个状态下暂时没有订阅。") : t("Add a subscription to bring your renewals into view.", "添加订阅后，即可在这里浏览续费与支出。")}</p>{onCreate ? <button className="button secondary" onClick={onCreate}><Icon name="plus" />{t("Add subscription", "新增订阅")}</button> : <Link className="button secondary" href="/subscriptions">{t("Open subscriptions", "前往订阅页面")}</Link>}</div>}
      </section>
    </> : <>
      <div className={styles.trendTools}><span>{t("One currency at a time", "按币种独立统计")}</span><div className={styles.filters} role="group" aria-label={t("Chart currency", "图表币种")}>{stats.currencies.map(key => <button key={key} aria-pressed={selectedCurrency === key} onClick={() => setCurrency(key)}>{key}</button>)}</div></div>
      <div className={styles.trendGrid}>
        <section className={styles.chartPanel}>
          <div className={styles.sectionHead}><h2>{t("Monthly rhythm", "月度节奏")}</h2><span>{selectedCurrency}</span></div>
          <div className={styles.chartAmount}><strong>{money(total, selectedCurrency, english)}</strong><span>{monthLabel(month, true)} · {t("paid", "已付")}</span></div>
          <div className={styles.bars} role="group" aria-label={t("Select a month to inspect recorded spending", "选择月份查看实际支出")}>
            {stats.months.map(key => { const amount = stats.actual[key][selectedCurrency] ?? 0; const expected = key === stats.currentMonth ? stats.expected[selectedCurrency] ?? 0 : amount; return <button key={key} onClick={() => setMonth(key)} aria-pressed={month === key} aria-label={`${monthLabel(key, true)}: ${money(amount, selectedCurrency, english)} ${t("paid", "已付")}${key === stats.currentMonth ? `, ${money(expected, selectedCurrency, english)} ${t("expected", "预计")}` : ""}`} data-current={key === stats.currentMonth}>
              <span className={styles.barValue}>{new Intl.NumberFormat(english ? "en-US" : "zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(amount / 100)}</span><span className={styles.barTrack}><span className={styles.barExpected} style={{ height: `${expected / max * 100}%` }} /><span className={styles.barActual} style={{ height: `${amount / max * 100}%` }} /></span><span className={styles.barLabel}>{monthLabel(key)}</span>
            </button>; })}
          </div>
          <div className={styles.legend}><span><i />{t("Recorded payments", "实际支付")}</span><span><i />{t("This month’s projection", "本月预计")}</span></div>
          {!stats.months.some(key => (stats.actual[key][selectedCurrency] ?? 0) > 0) && <p className={styles.note}>{t("No payments recorded in these months yet.", "这些月份暂时没有付款记录。")}</p>}
        </section>
        <section className={styles.chartPanel}>
          <div className={styles.sectionHead}><h2>{t("Where it goes", "支出去向")}</h2><span>{monthLabel(month)}</span></div>
          <div className={styles.composition}>
            <svg viewBox="0 0 120 120" className={styles.donut} role="img" aria-label={t(`Spending across ${parts.length} subscriptions; details below`, `${parts.length} 个订阅的支出占比，详情见下方`)}>
              <circle cx="60" cy="60" r="46" fill="none" stroke="var(--surface-soft)" strokeWidth="12" />
              {parts.map((part, index) => <circle key={part.id} cx="60" cy="60" r="46" fill="none" stroke={tones[index % tones.length]} strokeWidth="12" pathLength="100" strokeDasharray={`${part.amount / total * 100} ${100 - part.amount / total * 100}`} strokeDashoffset={-parts.slice(0, index).reduce((sum, value) => sum + value.amount / total * 100, 0)} transform="rotate(-90 60 60)" />)}
              <text x="60" y="59" textAnchor="middle" className={styles.donutNumber}>{parts.length}</text><text x="60" y="77" textAnchor="middle" className={styles.donutLabel}>{t("subscriptions", "个订阅")}</text>
            </svg>
            <div><strong>{money(total, selectedCurrency, english)}</strong><span>{t("Recorded spending", "实际记录支出")}</span></div>
          </div>
          {parts.length ? <ul className={styles.parts}>{parts.map((part, index) => <li key={part.id} style={tone(index)}><i /><Link href={`/subscriptions/${part.id}`}>{part.name}</Link><span>{(part.amount / total * 100).toFixed(1)}%</span><strong>{money(part.amount, selectedCurrency, english)}</strong></li>)}</ul> : <div className={styles.emptyChart}><p>{t("Nothing paid this month yet.", "这个月暂时没有已付支出。")}</p><span>{t("Your payment history will shape this chart.", "有付款记录后，这里会呈现真实支出构成。")}</span></div>}
          <p className={styles.note}>{t("Grouped by subscription. Categories are not available in the current ledger.", "当前按订阅项目分组；现有订阅账簿尚无分类字段。")}</p>
        </section>
      </div>
      <p className={styles.method}>{t("Expected = payments recorded this month + remaining renewals at current prices. Paused and ended subscriptions are excluded from remaining renewals. Currencies are never combined.", "预计支出 = 本月已付 + 按当前价格计算的本月剩余续费。暂停与结束的订阅不计入剩余计划，各币种不合并。")}</p>
    </>}
    <footer className={styles.footer}>{t("Your recurring ledger", "你的订阅账簿")}<span>{date(today)}</span></footer>
  </div>;
}
