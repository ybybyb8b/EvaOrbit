"use client";
import { WidgetIcon } from "./widget-icon";
import { useCallback, useState } from "react";
import { useLocale } from "../locale-controller";
import { TrackerEntryEditor } from "@/app/trackers/tracker-entry-editor";
import { orderedTrackerValues } from "@/lib/tracker-timeline";
import { formatTrackerTimeRange } from "@/lib/tracker-time-range";
import { translateUiCopy } from "@/lib/ui-copy";
import { useWidgetEnvironment, useWidgetResource, WidgetLink, WidgetStatus, widgetDate } from "./widget-context";
import type { WidgetCardProps, WidgetConfigProps } from "./widget-types";
import styles from "../personal-widget-stack.module.css";

export function TrackerWidget({ widget }: WidgetCardProps) {
  const { english, language } = useLocale(), environment = useWidgetEnvironment();
  const id = widget.type === "tracker" ? widget.trackerId : "";
  const list = useWidgetResource(environment.trackerList);
  const { trackerDetail } = environment;
  const load = useCallback(() => trackerDetail(id), [trackerDetail, id]);
  const detail = useWidgetResource(load), [recording, setRecording] = useState(false);
  if (widget.type !== "tracker") return null;
  const tracker = list.data?.find(item => item.id === id), latest = detail.data?.entries.slice().sort((a,b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const summary = latest && detail.data ? orderedTrackerValues(latest.values, detail.data.fields).flatMap(([key,value]) => {
    if (value === false || value === null || value === "") return [];
    const field = detail.data!.fields.find(item => item.key === key || String(item.id) === key);
    if (field?.archivedAt) return [];
    const name = translateUiCopy(field?.name ?? key, language);
    return [typeof value === "boolean" ? name : `${name}: ${field?.type === "time_range" ? formatTrackerTimeRange(value,english) : Array.isArray(value) ? value.join(", ") : typeof value === "object" ? "" : String(value)}`];
  }).join(" · ") : "";
  const lastAt = latest?.occurredAt ?? tracker?.lastOccurredAt;
  return <>
    <WidgetLink href={tracker?.href ?? "/trackers"} name={tracker?.name ?? (english ? "Open Trackers" : "打开观测")}/>
    <div className={styles.widgetCopy}><h3 className="user-content"><WidgetIcon image={tracker?.image}/>{tracker?.name ?? (english ? "Tracker" : "观测")}</h3>
      <WidgetStatus loading={list.loading} error={list.error || detail.error}/>
      {tracker ? <>{widget.showDetails && (summary || latest?.note) && <p className={`${styles.primaryInfo} user-content`}>{summary || latest?.note}</p>}<p className={summary || latest?.note ? styles.detail : styles.primaryInfo}>{lastAt ? <>{english ? "Last recorded" : "最近记录"} · {widgetDate(lastAt,english)}</> : english ? "No records yet" : "暂无记录"}</p></> : !list.loading && !list.error && <p>{english ? "Tracker unavailable. Edit this widget to choose another." : "观测不可用，请编辑组件重新选择。"}</p>}
    </div>
    <button type="button" className={`button secondary ${styles.action}`} disabled={!tracker || tracker.disabled || !detail.data || !!detail.error} aria-label={`${english ? "Record" : "记录"} ${tracker?.name ?? "Tracker"}`} aria-haspopup="dialog" onClick={() => setRecording(true)}>{english ? "Record" : "记录"}</button>
    {recording && detail.data && <TrackerEntryEditor centered trackerId={Number(id) || 0} fields={detail.data.fields} onClose={() => setRecording(false)} saveRecord={input => environment.trackers.save(id,input)} onSaved={environment.refresh}/>}
  </>;
}
export function TrackerWidgetConfig({ id, initial, onSave }: WidgetConfigProps) {
  const { english } = useLocale(), { trackerList } = useWidgetEnvironment(), list = useWidgetResource(trackerList);
  const previous = initial?.type === "tracker" ? initial : undefined;
  if (!list.data) return <WidgetStatus loading={list.loading} error={list.error}/>;
  return <form id="personal-widget-config" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ id, type:"tracker", trackerId:String(data.get("tracker")), showDetails:data.has("details") }); }}>
    <WidgetStatus loading={list.loading} error={list.error}/>
    {!list.data.length && <p>{english ? "Create a Tracker in Trackers first." : "请先在观测模块创建 Tracker。"}</p>}
    <label className="field"><span>{english ? "Tracker" : "观测"}</span><select required name="tracker" aria-label={english ? "Tracker" : "观测"} defaultValue={previous?.trackerId ?? ""}><option value="">{english ? "Choose a Tracker" : "选择具体观测"}</option>{list.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className={styles.option}><input type="checkbox" name="details" defaultChecked={previous?.showDetails ?? true}/><span>{english ? "Show recorded values" : "显示最近记录内容"}</span></label>
  </form>;
}
