"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SubscriptionLink as Link } from "@/components/subscriptions-data-context";
import { useLocale } from "@/components/locale-controller";
import { subscriptionTimeline } from "@/lib/subscription-timeline";
import { AUTO_RENEWAL_PAYMENT_NOTE,isManualSubscription,subscriptionDate } from "@/lib/subscriptions";
import type { Subscription, SubscriptionPayment } from "@/lib/types";
import { RenewalDateSheet } from "../renewal-date-sheet";
import styles from "./preview.module.css";

export function RenewalTimeline({ items, payments, today, mark, onDateChanged }: {
  items: Subscription[]; payments: SubscriptionPayment[]; today: string;
  mark: (item: Subscription) => ReactNode; onDateChanged: (item: Subscription) => void;
}) {
  const { english } = useLocale(), t = (en: string, zh: string) => english ? en : zh;
  const [view, setView] = useState<"upcoming" | "recorded">("upcoming"), [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const { upcoming, recorded } = useMemo(() => subscriptionTimeline(items, payments, today), [items, payments, today]);
  const count = view === "upcoming" ? upcoming.length : recorded.length, limit = expanded ? count : 4;
  const date = (value: string) => new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", { month: "short", day: "numeric", ...(value.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const money = (minor: number, currency: string) => new Intl.NumberFormat(english ? "en-US" : "zh-CN", { style: "currency", currency }).format(minor / 100);
  function timing(value: string) {
    const days = Math.round((Date.parse(`${value}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
    return days < 0 ? t(`Planned ${-days} days ago`, `原计划 ${-days} 天前`) : days === 0 ? t("Today", "今天") : t(`In ${days} days`, `${days} 天后`);
  }
  return <section className={styles.renewalTimeline} aria-label={t("Renewal timeline", "续费时间线")}>
    <div className={styles.sectionHead}><h2>{t("Renewal timeline", "续费时间线")}</h2><span>{view === "upcoming" ? t("Next 30 days + past plans", "未来 30 天及未处理计划") : t("Payment history", "付款记录")}</span></div>
    <div className={styles.filters} role="group" aria-label={t("Timeline view", "时间线视图")}>
      <button aria-pressed={view === "upcoming"} onClick={() => { setView("upcoming"); setExpanded(false); }}>{t("Upcoming", "待续费")} <span>{upcoming.length}</span></button>
      <button aria-pressed={view === "recorded"} onClick={() => { setView("recorded"); setExpanded(false); }}>{t("Recorded", "已记录")} <span>{recorded.length}</span></button>
    </div>
    {count ? <ol className={styles.timelineList}>
      {view === "upcoming" ? upcoming.slice(0, limit).map(item => <li key={item.id} className={styles.timelineEntry} data-past={subscriptionDate(item) < today || undefined}>
        <div className={styles.timelineDate}><time dateTime={subscriptionDate(item)}>{date(subscriptionDate(item))}</time><button className={styles.timelineAdjust} onClick={() => setEditing(item)}>{t("Adjust date", "调整日期")}</button></div>
        <div className={styles.timelineBody}>
          <Link className={styles.timelineName} href={`/subscriptions/${item.id}`}>{mark(item)}<span data-no-translate>{item.name}</span></Link>
          <small>{isManualSubscription(item)?`${t("Membership expires","会员到期")} · ${date(subscriptionDate(item))}`:timing(item.nextRenewalOn)} · {isManualSubscription(item)?t("No scheduled payment","无计划扣款"):item.autoRenew ? t("Automatic entry", "自动记账") : t("Confirm after paying", "付款后确认")}</small>
        </div>
        <strong className={styles.timelineAmount}>{isManualSubscription(item)?t("Expiry","到期"):money(item.currentAmountMinor, item.currency)}</strong>
      </li>) : recorded.slice(0, limit).map(payment => <li key={payment.id} className={styles.timelineEntry}>
        <time dateTime={payment.paidOn}>{date(payment.paidOn)}</time>
        <div className={styles.timelineBody}>
          <Link className={styles.timelineName} href={`/subscriptions/${payment.subscriptionId}`}>{mark(payment.subscription)}<span data-no-translate>{payment.subscription.name}</span></Link>
          <small>{payment.purchaseKey?t("Membership purchase","会员购买"):payment.note === AUTO_RENEWAL_PAYMENT_NOTE ? t("Automatic entry", "自动记账") : t("Recorded payment", "已记录付款")} · {payment.purchaseKey?t("Valid until","购买后有效期"):t("Scheduled", "原账期")} {date(payment.validUntil??payment.scheduledFor)}</small>
        </div>
        <strong className={styles.timelineAmount}>{money(payment.amountMinor, payment.currency)}</strong>
      </li>)}
    </ol> : <p className={styles.timelineEmpty}>{view === "upcoming" ? t("No renewals planned in the next 30 days.", "未来 30 天暂无续费计划。") : t("No payments recorded yet.", "尚未记录付款。")}</p>}
    {count > 4 && <button className={styles.timelineMore} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t("Show less", "收起") : t(`Show all ${count}`, `查看全部 ${count} 项`)}</button>}
    {editing && <RenewalDateSheet key={editing.id} item={editing} onClose={() => setEditing(null)} onSaved={onDateChanged} />}
  </section>;
}
