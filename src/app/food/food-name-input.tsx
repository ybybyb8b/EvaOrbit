"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { SelectDropdown } from "@/components/select-dropdown";
import type { FoodCatalogItem } from "@/lib/food-catalog";

export function FoodNameInput({ kind, value, onValueChange, onSelect, placeId, label, required = false }: {
  kind: "food" | "drink"; value: string; onValueChange: (value: string) => void;
  onSelect: (item: FoodCatalogItem) => void; placeId?: string; label: string; required?: boolean;
}) {
  const {english}=useLocale();
  const t=(value:string)=>translateUiCopy(value,english?"en":"zh-CN");
  const id = useId(), anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false), [items, setItems] = useState<FoodCatalogItem[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      void fetch(`/api/food/catalog?kind=${kind}&q=${encodeURIComponent(value)}${placeId ? `&placeId=${placeId}` : ""}`, { signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error("物品加载失败，请重试"); return response.json() as Promise<FoodCatalogItem[]>; })
        .then(result => { if (!controller.signal.aborted) setItems(result); })
        .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, value, placeId, open, attempt]);
  function pick(item: FoodCatalogItem) { onSelect(item); setOpen(false); }
  return <div className="field"><span>{label}</span><span ref={anchor} className="input-with-candidates">
    <input className="user-content" aria-label={t(label)} role="combobox" aria-expanded={open} aria-controls={open ? id : undefined} aria-autocomplete="list" value={value} required={required} maxLength={200} placeholder={t("输入名称，搜索已有物品或直接记录")} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => { setItems([]); onValueChange(event.target.value); setOpen(true); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (event.key === "ArrowDown") { event.preventDefault(); if (!open) setOpen(true); else anchor.current?.parentElement?.querySelector<HTMLButtonElement>(".eo-select-option")?.focus(); }
      if (event.key === "Enter" && open) { event.preventDefault(); setOpen(false); }
    }}/>
    <span className="input-candidates-toggle" data-expanded={open} aria-hidden="true"><Icon name="chevronDown"/></span>
    {open && <SelectDropdown anchor={anchor} id={id} label={label} onClose={() => setOpen(false)}><div className="eo-select-results" role="listbox" aria-label={label} aria-busy={loading}>
      {items.map(item => <button key={item.key} type="button" data-form-change className="eo-select-option user-content" role="option" aria-selected={false} onPointerDown={event => event.preventDefault()} onClick={() => pick(item)}><span>{item.name}<small>{[item.placeName || t("通用食品"), item.servingKcal !== null ? english?`About ${item.servingKcal} kcal / serving`:`约 ${item.servingKcal} kcal / 份` : ""].filter(Boolean).join(" · ")}</small></span></button>)}
      {loading && <small className="eo-select-empty" role="status">正在搜索…</small>}
      {error && <span role="alert">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></span>}
      {!loading && !error && !items.length && <small className="eo-select-empty">{value ? "没有匹配物品，可直接记录名称" : "输入名称搜索食品库和店铺物品"}</small>}
      {!placeId && value.trim() && <button type="button" className="eo-select-option user-content" onClick={() => setOpen(false)}>{english?`Record “${value.trim()}” directly`:`直接记录「${value.trim()}」`}</button>}
    </div></SelectDropdown>}
  </span></div>;
}
