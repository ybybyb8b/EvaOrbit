"use client";

import { useId, useRef, useState } from "react";

type Option = { id: number; name: string; detail?: string };
export function FoodLinkPicker({ label, options, selected, multiple = false, onSearch, onChange, loading = false, error, onRetry }: { label: string; options: Option[]; selected: number[]; multiple?: boolean; onSearch: (query: string) => void; onChange: (ids: number[]) => void; loading?: boolean; error?: string; onRetry?: () => void }) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  function closeMenu() {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector("summary")?.focus();
  }
  const picked = options.filter(option => selected.includes(option.id));
  const matches = options.filter(option => `${option.name} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="field food-link-field"><span id={`${id}-label`}>{label}</span>
    <details ref={details} className="food-link-picker" onKeyDown={event => { if (event.key === "Escape" && details.current?.open) { event.preventDefault(); event.stopPropagation(); details.current.open = false; details.current.querySelector("summary")?.focus(); } }}>
      <summary aria-labelledby={`${id}-label ${id}-value`}><span id={`${id}-value`} className="user-content">{multiple ? selected.length ? `已选择 ${selected.length} 道菜品` : "选择菜品，可多选" : picked[0] ? [picked[0].name, picked[0].detail].filter(Boolean).join(" · ") : "未关联店铺"}</span><span aria-hidden="true">⌄</span></summary>
      <div className="food-link-menu"><input type="search" aria-label={`搜索${multiple ? "菜品" : "店铺"}`} placeholder={multiple ? "搜索菜品名称、品类" : "搜索店名、城市、地点"} value={query} onChange={event => { setQuery(event.target.value); onSearch(event.target.value); }} />
        <div className="food-link-options">
          {!multiple && <button type="button" data-form-change onClick={() => { onChange([]); closeMenu(); setQuery(""); onSearch(""); }}>未关联店铺</button>}
          {matches.map(option => multiple ? <label className="food-link-option" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(value => value !== option.id))} /><span className="user-content">{option.name}{option.detail && <small>{option.detail}</small>}</span></label> : <button type="button" data-form-change className="user-content" key={option.id} aria-pressed={selected.includes(option.id)} onClick={() => { onChange([option.id]); closeMenu(); setQuery(""); onSearch(""); }}>{option.name}{option.detail && <small>{option.detail}</small>}</button>)}
          {loading && <p role="status">正在搜索…</p>}
          {error && <div role="alert"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry}>重试</button>}</div>}
          {!loading && !error && !matches.length && <p className="food-link-empty">{query ? "没有匹配的结果" : multiple ? "这家店还没有菜品" : "还没有店铺"}</p>}
        </div>
        {multiple && <button type="button" onClick={closeMenu}>选好了 · {selected.length}</button>}
      </div>
    </details>
    {multiple && picked.length > 0 && <div className="food-linked-dishes">{picked.map(option => <button type="button" data-form-change className="user-content" key={option.id} aria-label={`移除 ${option.name}`} onClick={() => onChange(selected.filter(value => value !== option.id))}>{option.name}<span aria-hidden="true"> ×</span></button>)}</div>}
  </div>;
}
