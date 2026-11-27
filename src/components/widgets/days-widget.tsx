"use client";
import { useCallback } from "react";
import { importantDateStats, importantDateDisplay, sortImportantDates, type ImportantDate } from "@/lib/important-dates";
import { dateInEvaOrbit } from "@/lib/time";
import { useLocale } from "../locale-controller";
import { useWidgetEnvironment, useWidgetResource, WidgetLink, WidgetStatus } from "./widget-context";
import type { WidgetCardProps, WidgetConfigProps } from "./widget-types";
import styles from "../personal-widget-stack.module.css";
export function useWidgetDates() {
  const { json } = useWidgetEnvironment();
  return useWidgetResource(useCallback(() => json<ImportantDate[]>("/api/important-dates"),[json]));
}
export function DaysWidget({ widget }: WidgetCardProps) {
  const { english } = useLocale(), resource = useWidgetDates();
  if (widget.type !== "days") return null;
  const item = resource.data?.find(item => item.id === widget.dateId && !item.archived);
  const stats = item && importantDateStats(item,dateInEvaOrbit());
  const ordinal=item&&((item.displayMode??"auto")!=="auto"||item.countMode==="ordinal")?importantDateDisplay(item,dateInEvaOrbit(),english):null;
  const days = stats ? widget.display === "elapsed" ? stats.elapsed : stats.remaining ?? stats.elapsed : null;
  return <><WidgetLink href="/days" name={item?.title ?? (english ? "All dates" : "全部日子")}/><div className={styles.daysCopy}><h3 className="user-content">{item?.title ?? (english ? "Days" : "如期")}</h3><WidgetStatus loading={resource.loading} error={resource.error}/>{item && <p><span className={styles.tag}>{item.category || (item.recurrence === "yearly" ? english ? "Anniversary" : "纪念日" : english ? "Countdown" : "倒数日")}</span></p>}{!item && !resource.loading && !resource.error && <p>{english ? "This date is unavailable. Choose another in Edit." : "此日子不可用，请在编辑中重新选择。"}</p>}</div>{days !== null && <div className={styles.countdown}><strong>{ordinal?ordinal.text:Math.abs(days).toLocaleString(english ? "en" : "zh-CN")}</strong><span>{ordinal?ordinal.unit:days === 0 ? english ? "Today" : "就是今天" : widget.display === "elapsed" ? days >= 0 ? english ? "days since" : "天前" : english ? "days to go" : "天后" : days > 0 ? english ? "days to go" : "天后" : english ? "days since" : "天前"}</span></div>}</>;
}
export function DaysWidgetConfig({ id, initial, onSave }: WidgetConfigProps) {
  const { english } = useLocale(), resource = useWidgetDates(), previous = initial?.type === "days" ? initial : undefined;
  if (!resource.data) return <WidgetStatus loading={resource.loading} error={resource.error}/>;
  return <form id="personal-widget-config" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ id, type:"days", dateId:Number(data.get("date")), display:data.get("display") === "elapsed" ? "elapsed" : "next" }); }}><WidgetStatus loading={resource.loading} error={resource.error}/>
    {!resource.data.some(item => !item.archived) && <p>{english ? "Add a date in Days first." : "请先在如期模块添加日子。"}</p>}
    <label className="field"><span>{english ? "Date" : "日子"}</span><select name="date" required aria-label={english ? "Date" : "日子"} defaultValue={previous?.dateId ?? ""}><option value="">{english ? "Choose a date" : "选择具体日子"}</option>{sortImportantDates(resource.data?.filter(item => !item.archived) ?? []).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label className="field"><span>{english ? "Display" : "展示方式"}</span><select name="display" aria-label={english ? "Display" : "展示方式"} defaultValue={previous?.display ?? "next"}><option value="next">{english ? "Next occurrence" : "距离下一次"}</option><option value="elapsed">{english ? "Since original date" : "从原始日期累计"}</option></select></label>
  </form>;
}
