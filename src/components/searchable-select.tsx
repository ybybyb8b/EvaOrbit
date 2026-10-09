"use client";

import { useId, useRef, useState } from "react";
import { useLocale } from "./locale-controller";
import { SelectDropdown } from "./select-dropdown";
import { translateUiCopy } from "@/lib/ui-copy";
import { Icon } from "./icons";
import { usesCapsules } from "@/lib/choice-presentation";

export type SearchOption = { value: string; label: string; detail?: string; disabled?: boolean };

export function SearchableSelect({ value, options, onValueChange, label, required = false, disabled = false, onSearch, loading = false, error, onRetry, searchable = true, clearable = false, presentation = "auto" }: {
  value: string; options: readonly SearchOption[]; onValueChange: (value: string) => void; label: string; required?: boolean; disabled?: boolean;
  onSearch?: (query: string) => void; loading?: boolean; error?: string; onRetry?: () => void;
  searchable?: boolean; clearable?: boolean; presentation?: "auto" | "capsules";
}) {
  const { english } = useLocale();
  const t=(value:string)=>translateUiCopy(value,english?"en":"zh-CN");
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(option => option.value === value);
  const matches = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const capsuleOptions = clearable ? options.filter(option => option.value !== "") : options;
  if ((presentation === "capsules" || usesCapsules(capsuleOptions.length, searchable)) && !onSearch && !loading && !error) return <span className="choice-select">
    <span className="choice-capsules" role="group" aria-label={label}>{capsuleOptions.map(option => <button key={option.value} type="button" data-form-change aria-pressed={option.value === value} disabled={disabled || option.disabled} onClick={() => onValueChange(clearable && option.value === value ? "" : option.value)}>{searchable&&option.value?option.label:t(option.label)}{option.detail && <small>{option.detail}</small>}</button>)}</span>
    {required && <input className="choice-select-native" tabIndex={-1} aria-label={label} value={value} required disabled={disabled} onChange={() => undefined} onInvalid={event => { event.preventDefault(); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }} />}
  </span>;
  function close() { setOpen(false); if (details.current) details.current.open = false; details.current?.querySelector("summary")?.focus({ preventScroll: true }); }
  const results = <span className="eo-select-results" role="group" aria-label={label} aria-busy={loading}>
    {loading && <small className="eo-select-empty" role="status">{english ? "Loading…" : "加载中…"}</small>}
    {error && <span role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>{english ? "Retry" : "重试"}</button>}</span>}
    {matches.map(option => <button key={option.value} data-form-change className={`eo-select-option${searchable && option.value ? " user-content" : ""}`} type="button" aria-pressed={option.value === value} disabled={option.disabled} onClick={() => { onValueChange(option.value); setQuery(""); onSearch?.(""); close(); }}><><span>{searchable&&option.value?option.label:t(option.label)}{option.detail && <small>{option.detail}</small>}</span><span className="eo-select-check" aria-hidden="true">{option.value === value ? <Icon name="check"/> : null}</span></></button>)}
    {!loading && !error && !matches.length && <small className="eo-select-empty">{english ? "No matches" : "没有匹配项"}</small>}
  </span>;
  return <span className="searchable-select" ref={anchor}>
    <details ref={details} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => { if (event.key === "Escape" && details.current?.open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <summary aria-label={label} aria-controls={open ? id : undefined} aria-expanded={open} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><span className={searchable && value ? "user-content" : undefined}>{(selected?.label && (searchable && value ? selected.label : t(selected.label))) || (value ? `#${value}` : english ? "Not selected" : "未选择")}</span><Icon name="chevronDown"/></summary>
      {!disabled && open && <SelectDropdown anchor={anchor} onClose={close} id={id} label={label}>{searchable && <div className="eo-select-search-area"><input className="eo-select-search" type="search" aria-label={`${english ? "Search" : "搜索"} ${label}`} placeholder={english ? "Search…" : "搜索…"} value={query} onChange={event => { setQuery(event.target.value); onSearch?.(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></div>}{results}</SelectDropdown>}
    </details>
    {required && <input className="searchable-select-validation" tabIndex={-1} aria-label={label} value={value} required disabled={disabled} onChange={() => undefined} onInvalid={() => { if (details.current) details.current.open = true; setOpen(true); requestAnimationFrame(() => (details.current?.querySelector<HTMLInputElement>('input[type="search"]') ?? details.current?.querySelector('summary'))?.focus()); }} />}
  </span>;
}
