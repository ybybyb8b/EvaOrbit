"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { SelectDropdown } from "@/components/select-dropdown";
import styles from "./places-filter.module.css";

export type PlaceFilterGroup = { value: string; label: string; children: { value: string; label: string }[] };

export function PlacesCascader({ groups, kind, value, onChange }: {
  groups: PlaceFilterGroup[]; kind: string; value: string; onChange: (kind: string, value: string) => void;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");
  const current = groups.find(group => group.value === level);
  const selected = groups.find(group => group.value === kind);
  const selectedLabel = selected?.children.find(child => child.value === value)?.label ?? value;
  const needle = query.trim().toLocaleLowerCase();
  const matches = groups.flatMap(group => group.children.map(child => ({ group, child })))
    .filter(({ group, child }) => `${group.label} ${child.label}`.toLocaleLowerCase().includes(needle));
  function close() {
    setOpen(false);
    if (details.current) details.current.open = false;
    details.current?.querySelector("summary")?.focus({ preventScroll: true });
  }
  function choose(group: string, child: string) { onChange(group, child); close(); }
  function enter(group: string) { setLevel(group); search.current?.focus({ preventScroll: true }); }
  function leaf(group: PlaceFilterGroup, child: PlaceFilterGroup["children"][number], path = false) {
    const checked = kind === group.value && value === child.value;
    return <button type="button" role="option" aria-selected={checked} aria-label={`${group.label} → ${child.label}`} className="eo-select-option" key={`${group.value}:${child.value}`} onClick={() => choose(group.value, child.value)} data-selected={checked}>
      <span className="user-content">{path ? `${group.label} → ${child.label}` : child.label}</span>
      <span className="eo-select-check">{checked && <Icon name="check" />}</span>
    </button>;
  }
  return <span ref={anchor} className={`searchable-select ${styles.cascader}`}>
    <details ref={details} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary aria-label={kind && value ? `筛选店铺，当前：${selected?.label ?? kind} → ${selectedLabel}` : "筛选店铺"} title={kind && value ? `${selected?.label ?? kind} → ${selectedLabel}` : "筛选店铺"} data-active={Boolean(kind && value)} aria-controls={id} aria-expanded={open} onClick={() => { if (!open) { setQuery(""); setLevel(kind); } }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setQuery(""); setLevel(kind); if (details.current) details.current.open = true; setOpen(true); requestAnimationFrame(() => search.current?.focus()); }
        if (event.key === "Escape" && open) { event.preventDefault(); close(); }
      }}><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7v7l-4 2v-9z" /></svg></summary>
      {open && <SelectDropdown anchor={anchor} minWidth={320} onClose={close} id={id} label="店铺级联筛选" className={styles.panel}>
        <div className="eo-select-search-area"><input ref={search} className="eo-select-search" type="search" aria-label="搜索筛选项" placeholder="搜索类型、品类、城市…" value={query} onChange={event => setQuery(event.target.value)} /></div>
        {!needle && current && <div className={styles.navigation}><button type="button" aria-label="返回全部筛选项" onClick={() => enter("")}><Icon name="arrow" /><span>返回</span></button><strong>{current.label}</strong></div>}
        <div key={needle ? "search" : level} className={`eo-select-results ${styles.results}`} role="listbox" aria-label={needle ? "筛选搜索结果" : current?.label ?? "店铺筛选项"} onKeyDown={event => {
          if (event.nativeEvent.isComposing || needle) return;
          if (event.key === "ArrowLeft" && current) { event.preventDefault(); enter(""); }
          if (event.key === "ArrowRight" && !current) { const group = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-group]")?.dataset.group; if (group) { event.preventDefault(); enter(group); } }
        }}>
          {needle ? matches.map(({ group, child }) => leaf(group, child, true)) : current ? current.children.map(child => leaf(current, child)) : <>
            <button type="button" role="option" aria-selected={!kind || !value} data-selected={!kind || !value} className="eo-select-option" onClick={() => choose("", "")}><span>全部店铺</span><span className="eo-select-check">{(!kind || !value) && <Icon name="check" />}</span></button>
            {groups.map(group => <button type="button" role="option" aria-selected={kind === group.value && Boolean(value)} data-group={group.value} key={group.value} className="eo-select-option" onClick={() => enter(group.value)}><span>{group.label}{kind === group.value && value && <small className="user-content">{selectedLabel}</small>}</span><Icon name="arrow" /></button>)}
          </>}
          {((needle && !matches.length) || (!needle && current && !current.children.length)) && <span className="eo-select-empty" role="status">{needle ? "没有匹配的筛选项" : `还没有可选的${current?.label}`}</span>}
        </div>
      </SelectDropdown>}
    </details>
  </span>;
}
