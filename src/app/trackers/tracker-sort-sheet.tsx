"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { ArrowDown2, ArrowUp2, Sort } from "reicon-react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { TrackerIcon } from "@/components/tracker-icon";
import type { TrackerSummary } from "@/lib/types";
import { moveTrackerOrder, orderedTrackerGroups, readTrackerOrder, type TrackerOrder } from "@/lib/tracker-order";

const orderChanged = "eo:tracker-order-changed";
const emptySnapshot = () => "";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener); window.addEventListener(orderChanged, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(orderChanged, listener); };
}
export function useTrackerOrder(scope: string | null): [TrackerOrder, (order: TrackerOrder) => void] {
  const key = `eo:tracker-order:${scope}`;
  const value = useSyncExternalStore(subscribe, () => { try { return scope ? localStorage.getItem(key) ?? "" : ""; } catch { return ""; } }, emptySnapshot);
  return [readTrackerOrder(value), order => {
    if (!scope) throw new Error("Missing account");
    localStorage.setItem(key, JSON.stringify(order));
    window.dispatchEvent(new Event(orderChanged));
  }];
}

type Drag = { key: string; group: string | null; row: HTMLElement; body: HTMLElement; startY: number; y: number; x: number; scroll: number; target: string | null; active: boolean };
export function TrackerSortSheet({ trackers, archived, order, onSave, onClose }: { trackers: TrackerSummary[]; archived: boolean; order: TrackerOrder; onSave: (order: TrackerOrder) => void; onClose: () => void }) {
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  const [draft, setDraft] = useState(() => {
    const groups = orderedTrackerGroups(trackers, order);
    return { groups: groups.map(group => group.name), entries: groups.flatMap(group => group.items.map(item => item.id)) };
  });
  const [original] = useState(() => JSON.stringify(draft));
  const root = useRef<HTMLFormElement>(null), drag = useRef<Drag | null>(null), frame = useRef(0);
  const [announcement, setAnnouncement] = useState(""), [error, setError] = useState("");
  const groups = orderedTrackerGroups(trackers.filter(item => Boolean(item.archivedAt) === archived), draft);
  useEffect(() => () => { cancelAnimationFrame(frame.current); }, []);

  function move(from: string, to: string) {
    setDraft(current => from.startsWith("g:")
      ? { ...current, groups: moveTrackerOrder(current.groups, from.slice(2), to.slice(2)) }
      : { ...current, entries: moveTrackerOrder(current.entries, Number(from.slice(2)), Number(to.slice(2))) });
    setAnnouncement(t("Order updated", "顺序已调整"));
  }
  function finish(cancel = false) {
    cancelAnimationFrame(frame.current);
    const current = drag.current;
    if (!current) return;
    current.row.style.removeProperty("transform"); current.row.removeAttribute("data-dragging");
    root.current?.querySelectorAll("[data-drop-target]").forEach(row => row.removeAttribute("data-drop-target"));
    if (!cancel && current.active && current.target) move(current.key, current.target);
    drag.current = null;
  }
  function track() {
    const current = drag.current;
    if (!current) return;
    if (Math.abs(current.y - current.startY) > 8) current.active = true;
    if (current.active) {
      const bounds = current.body.getBoundingClientRect();
      const top = Math.max(bounds.top, 0), bottom = Math.min(bounds.bottom, window.innerHeight);
      if (current.y < top + 40) current.body.scrollTop -= Math.min(12, (top + 40 - current.y) / 4);
      if (current.y > bottom - 40) current.body.scrollTop += Math.min(12, (current.y - bottom + 40) / 4);
      current.row.dataset.dragging = "true";
      current.row.style.transform = `translateY(${current.y - current.startY + current.body.scrollTop - current.scroll}px)`;
      let target: HTMLElement | undefined;
      if (current.y >= top && current.y <= bottom) target = [...root.current!.querySelectorAll<HTMLElement>("[data-sort-key]")].find(row => {
        if (row === current.row || row.dataset.sortKey?.slice(0, 2) !== current.key.slice(0, 2) || (current.group !== null && row.dataset.sortGroup !== current.group)) return false;
        const rect = row.getBoundingClientRect();
        return current.y >= rect.top && current.y <= rect.bottom && current.x >= rect.left && current.x <= rect.right;
      });
      current.target = target?.dataset.sortKey ?? null;
      root.current?.querySelectorAll("[data-drop-target]").forEach(row => row.removeAttribute("data-drop-target"));
      if (target) target.dataset.dropTarget = "true";
    }
    frame.current = requestAnimationFrame(track);
  }
  function start(event: PointerEvent<HTMLButtonElement>, key: string, group: string | null) {
    if (!event.isPrimary || event.button !== 0) return;
    finish(true);
    const row = event.currentTarget.closest<HTMLElement>("[data-sort-key]")!;
    const body = row.closest<HTMLElement>(".form-sheet-body")!;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { key, group, row, body, startY: event.clientY, y: event.clientY, x: event.clientX, scroll: body.scrollTop, target: null, active: false };
    frame.current = requestAnimationFrame(track);
  }
  function controls(key: string, name: string, group: string | null, siblings: string[]) {
    const index = siblings.indexOf(key);
    return <div className="tracker-sort-controls">
      <button type="button" className="tracker-sort-grip" aria-label={t(`Drag ${name}`, `拖动 ${name}`)} aria-describedby="tracker-sort-help" disabled={siblings.length < 2}
        onPointerDown={event => start(event, key, group)}
        onPointerMove={event => { if (drag.current) { drag.current.y = event.clientY; drag.current.x = event.clientX; } }}
        onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
        onKeyDown={event => {
          if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); }
          const offset = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
          if (offset) { event.preventDefault(); if (siblings[index + offset]) move(key, siblings[index + offset]); }
        }}><Sort size={20} weight="Outline" aria-hidden="true" /></button>
      <button type="button" aria-label={t(`Move ${name} up`, `上移 ${name}`)} disabled={index === 0} onClick={() => move(key, siblings[index - 1])}><ArrowUp2 size={16} weight="Outline" aria-hidden="true" /></button>
      <button type="button" aria-label={t(`Move ${name} down`, `下移 ${name}`)} disabled={index === siblings.length - 1} onClick={() => move(key, siblings[index + 1])}><ArrowDown2 size={16} weight="Outline" aria-hidden="true" /></button>
    </div>;
  }
  return <FormSheet title={t("Sort Trackers", "排序 Tracker")} onClose={onClose} formId="tracker-sort-form" submitLabel={t("Save order", "保存顺序")} dirty={JSON.stringify(draft) !== original}>
    <form id="tracker-sort-form" className="tracker-sort-form" ref={root} onSubmit={event => {
      event.preventDefault(); finish(true);
      try { onSave(draft); onClose(); } catch { setError(t("Could not save on this device. Allow local storage and try again.", "无法保存到此设备，请允许本地存储后重试。")); }
    }}>
      <p id="tracker-sort-help" className="tracker-sort-help">{t("Drag a group or a Tracker by its handle. Trackers stay in their group. You can also use the arrow buttons.", "拖动把手调整分组或组内 Tracker 的顺序，不改变分组归属。也可使用上下按钮调整。")}</p>
      <p className="tracker-sort-device">{t("Saved for this account on this device only.", "仅为当前账户保存在此设备，不跨设备同步。")}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
      {groups.map(group => <section className="tracker-sort-group" key={group.name} data-sort-key={`g:${group.name}`}>
        <header><h3 className="user-content">{group.name}</h3><span>{group.items.length}</span>{controls(`g:${group.name}`, group.name, null, groups.map(item => `g:${item.name}`))}</header>
        <div className="tracker-sort-items">{group.items.map(item => <div className="tracker-sort-item" key={item.id} data-sort-key={`e:${item.id}`} data-sort-group={group.name}>
          <TrackerIcon tracker={item} size={30} /><span className="user-content">{item.name}</span>{controls(`e:${item.id}`, item.name, group.name, group.items.map(item => `e:${item.id}`))}
        </div>)}</div>
      </section>)}
    </form>
  </FormSheet>;
}
