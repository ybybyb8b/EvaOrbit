"use client";
import { useCallback } from "react";
import type { TrainingLog } from "@/lib/types";
import { trainingWidgetSummary } from "@/lib/personal-widget-data";
import { useLocale } from "../locale-controller";
import { useWidgetEnvironment, useWidgetResource, WidgetLink, WidgetStatus, widgetDate } from "./widget-context";
import type { WidgetCardProps, WidgetConfigProps } from "./widget-types";
import styles from "../personal-widget-stack.module.css";
export function TrainingWidget({ widget }: WidgetCardProps) {
  const { english } = useLocale(), { json, Link } = useWidgetEnvironment();
  const resource = useWidgetResource(useCallback(() => json<TrainingLog[]>("/api/health/training"),[json]));
  if (widget.type !== "training") return null;
  const summary = resource.data && trainingWidgetSummary(resource.data,widget.period), period = widget.period === "week" ? english ? "This week" : "本周" : english ? "This month" : "本月";
  const limited = (summary?.count ?? 0) >= 100;
  return <><WidgetLink href="/health?view=training" name={english ? "Training" : "训练"}/><div className={styles.widgetCopy}><h3>{english ? "Training" : "训练"}<small className={styles.period}>{period}</small></h3><WidgetStatus loading={resource.loading} error={resource.error}/>{summary && <><p className={styles.trainingMetrics}><strong>{summary.count}{limited ? "+" : ""}</strong> {english ? "sessions" : "次"}<span>{limited ? "≥ " : ""}{Math.round(summary.minutes)} {english ? "min" : "分钟"}</span></p><p className={`${styles.detail} user-content`}>{summary.latest ? `${summary.latest.course || (english ? "Last workout" : "最近训练")} · ${widgetDate(summary.latest.occurredAt,english,summary.latest.occurredHasExplicitTime)}` : english ? "Your next session starts here." : "从这里开始下一次训练。"}</p>{limited && <small>{english ? "Based on the latest 100 records" : "基于最近 100 条记录"}</small>}</>}</div><Link href="/health?view=training" className={`button secondary ${styles.action}`}>{english ? "Open" : "查看"}</Link></>;
}
export function TrainingWidgetConfig({ id, initial, onSave }: WidgetConfigProps) {
  const { english } = useLocale();
  return <form id="personal-widget-config" onSubmit={event => {event.preventDefault();onSave({id,type:"training",period:new FormData(event.currentTarget).get("period") === "month" ? "month" : "week"});}}><label className="field"><span>{english ? "Summary period" : "汇总范围"}</span><select name="period" aria-label={english ? "Summary period" : "汇总范围"} defaultValue={initial?.type === "training" ? initial.period : "week"}><option value="week">{english ? "This week" : "本周"}</option><option value="month">{english ? "This month" : "本月"}</option></select></label></form>;
}
