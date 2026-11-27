"use client";
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Add, Edit2, Trash2, Menu } from "reicon-react";
import { FormSheet } from "../form-sheet";
import { useLocale } from "../locale-controller";
import { newTrackerLocalId } from "@/lib/tracker-local-store";
import { removeWidget, reorderWidgets, validWidget, type WidgetInstance, type WidgetStackConfig, type WidgetType } from "@/lib/personal-widgets";
import { useWidgetEnvironment, useWidgetResource } from "./widget-context";
import { widgetDefinition, widgetRegistry } from "./widget-registry";
import styles from "../personal-widget-stack.module.css";

export function WidgetInstanceName({ widget }: { widget: WidgetInstance }) {
  const environment = useWidgetEnvironment(), { english } = useLocale(), definition = widgetDefinition(widget.type);
  const load = useCallback(() => definition.name(widget,environment),[definition,widget,environment]);
  const result = useWidgetResource(load);
  return <span className="user-content">{result.data || (english ? definition.en : definition.zh)}</span>;
}
export function WidgetStackEditor({ config, onChange, onClose }: { config: WidgetStackConfig; onChange: (config: WidgetStackConfig) => void; onClose: () => void }) {
  const { english } = useLocale();
  const tabsId=useId();
  const [page,setPage] = useState<"mine"|"add">("mine"), [configure,setConfigure] = useState<{id:string;type:WidgetType;initial?:WidgetInstance} | null>(null);
  const [dragging,setDragging] = useState<string | null>(null), list = useRef<HTMLDivElement>(null);
  const dragMove = useEffectEvent((event: PointerEvent) => {
    if (!dragging || !list.current) return;
    const scroller=list.current.closest<HTMLElement>(".form-sheet-body");
    if(scroller) {
      const bounds=scroller.getBoundingClientRect();
      scroller.scrollTop += event.clientY > bounds.bottom-36 ? 14 : event.clientY < bounds.top+36 ? -14 : 0;
    }
    const rows = Array.from(list.current.querySelectorAll<HTMLElement>("[data-widget-row]"));
    const target = rows.findIndex(row => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    const next = reorderWidgets(config,dragging,target < 0 ? rows.length - 1 : target);
    if (next.widgets.some((widget,index) => widget.id !== config.widgets[index]?.id)) onChange(next);
  });
  useEffect(() => {
    if (!dragging) return;
    const move = (event:PointerEvent) => dragMove(event), release = () => setDragging(null);
    window.addEventListener("pointermove",move); window.addEventListener("pointerup",release); window.addEventListener("pointercancel",release); window.addEventListener("blur",release);
    return () => { window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",release); window.removeEventListener("pointercancel",release); window.removeEventListener("blur",release); };
  },[dragging]);
  const Configure = configure && widgetDefinition(configure.type).Configure;
  return <FormSheet className="centered-modal personal-widget-editor" title={english ? "Personal Widgets" : "日常小组件"} dirty={configure ? undefined : false} onClose={onClose} formId={configure ? "personal-widget-config" : undefined} submitLabel={configure ? english ? "Save widget" : "保存组件" : undefined}>
    <div className={styles.tabs} role="tablist" aria-label={english ? "Widget library" : "组件库"}>{(["mine","add"] as const).map(value => <button type="button" role="tab" id={`${tabsId}-${value}`} aria-controls={`${tabsId}-panel`} tabIndex={page === value ? 0 : -1} key={value} aria-selected={page === value} onClick={() => {setConfigure(null);setPage(value);}} onKeyDown={event => {
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      event.preventDefault();const next=event.key === "Home" ? "mine" : event.key === "End" ? "add" : page === "mine" ? "add" : "mine";
      setConfigure(null);setPage(next);document.getElementById(`${tabsId}-${next}`)?.focus();
    }}>{value === "mine" ? english ? "My Stack" : "我的叠放" : english ? "Add Widgets" : "添加组件"}</button>)}</div>
    <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${page}`}>
    {Configure && configure ? <div className={styles.configuration}><header><button type="button" className="text-button" onClick={() => setConfigure(null)}>{english ? "Back" : "返回"}</button><h3>{english ? widgetDefinition(configure.type).en : widgetDefinition(configure.type).zh}</h3></header><Configure key={configure.id} id={configure.id} initial={configure.initial} onSave={widget => {
      if (!validWidget(widget)) return;
      const exists = config.widgets.some(item => item.id === widget.id);
      if (!exists && config.widgets.length >= 100) return;
      onChange({...config,widgets:exists ? config.widgets.map(item => item.id === widget.id ? widget : item) : [...config.widgets,widget],activeId:config.activeId ?? widget.id}); setConfigure(null);setPage("mine");
    }}/></div> : page === "mine" ? <>
      <div className={styles.settings} ref={list} role="list" aria-label={english ? "My Stack" : "我的叠放"}>{config.widgets.map((widget,index) => <div key={widget.id} data-widget-row={widget.id} data-dragging={dragging === widget.id} role="listitem">
        <button type="button" className={styles.dragHandle} aria-label={`${english ? "Reorder widget" : "调整组件顺序"} ${index + 1}`} aria-describedby="widget-reorder-help" onPointerDown={event => {if(event.button !== 0)return;event.preventDefault();setDragging(widget.id);}} onKeyDown={event => { if(event.key !== "ArrowUp" && event.key !== "ArrowDown")return;event.preventDefault();onChange(reorderWidgets(config,widget.id,index+(event.key === "ArrowUp" ? -1 : 1))); }}><Menu size={18} weight="Outline"/></button>
        <button type="button" className={styles.rowName} onClick={() => setConfigure({id:widget.id,type:widget.type,initial:widget})}><WidgetInstanceName widget={widget}/><small>{english ? widgetDefinition(widget.type).en : widgetDefinition(widget.type).zh}</small></button>
        <button type="button" aria-label={`${english ? "Edit widget" : "编辑组件"} ${index + 1}`} onClick={() => setConfigure({id:widget.id,type:widget.type,initial:widget})}><Edit2 size={17} weight="Outline"/></button>
        <button type="button" aria-label={`${english ? "Remove widget" : "移除组件"} ${index + 1}`} onClick={() => onChange(removeWidget(config,widget.id))}><Trash2 size={17} weight="Outline"/></button>
      </div>)}</div>
      <p id="widget-reorder-help" className={styles.hint}>{english ? "Drag the handle to reorder, or focus it and use the arrow keys." : "拖动把手调整顺序，也可聚焦把手后使用方向键。"}</p>
      {!config.widgets.length && <p>{english ? "A little space for what matters to you." : "留一点空间，放下你关心的日常。"}</p>}
      <button type="button" className={`button secondary ${styles.addButton}`} onClick={() => setPage("add")}><Add size={18}/>{english ? "Add Widgets" : "添加组件"}</button>
    </> : <div className={styles.library}>{widgetRegistry.map(definition => <button key={definition.type} type="button" disabled={config.widgets.length >= 100} onClick={() => setConfigure({id:newTrackerLocalId(),type:definition.type})}><strong>{english ? definition.en : definition.zh}</strong><span>{english ? definition.description.en : definition.description.zh}</span><Add size={19} weight="Outline"/></button>)}</div>}
    </div>
  </FormSheet>;
}
