"use client";

import { useId, useRef, useState } from "react";
import { useLocale } from "./locale-controller";

export type SearchOption = { value: string; label: string; detail?: string; disabled?: boolean };

export function SearchableSelect({ value, options, onValueChange, label, required = false, disabled = false, onSearch, loading = false, error, onRetry }: {
  value: string; options: readonly SearchOption[]; onValueChange: (value: string) => void; label: string; required?: boolean; disabled?: boolean;
  onSearch?: (query: string) => void; loading?: boolean; error?: string; onRetry?: () => void;
}) {
  const { english } = useLocale();
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const selected = options.find(option => option.value === value);
  const matches = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function close() { if (details.current) details.current.open = false; details.current?.querySelector("summary")?.focus(); }
  return <span className="searchable-select">
    <details ref={details} onKeyDown={event => { if (event.key === "Escape" && details.current?.open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <summary aria-label={label} aria-controls={id} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><span className="user-content">{selected?.label || (value ? `#${value}` : english ? "Not selected" : "未选择")}</span><span aria-hidden="true">⌄</span></summary>
      {!disabled && <span className="searchable-select-menu" id={id}>
        <input type="search" aria-label={`${english ? "Search" : "搜索"} ${label}`} placeholder={english ? "Search…" : "搜索…"} value={query} onChange={event => { setQuery(event.target.value); onSearch?.(event.target.value); }} />
        <span className="searchable-select-options" role="group" aria-label={label} aria-busy={loading}>
          {loading && <small role="status">{english ? "Loading…" : "加载中…"}</small>}
          {error && <span role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>{english ? "Retry" : "重试"}</button>}</span>}
          {matches.map(option => <button key={option.value} data-form-change className="user-content" type="button" aria-pressed={option.value === value} disabled={option.disabled} onClick={() => { onValueChange(option.value); setQuery(""); onSearch?.(""); close(); }}>{option.label}{option.detail && <small>{option.detail}</small>}</button>)}
          {!loading && !error && !matches.length && <small>{english ? "No matches" : "没有匹配项"}</small>}
        </span>
      </span>}
    </details>
    {required && <input className="searchable-select-validation" tabIndex={-1} aria-label={label} value={value} required disabled={disabled} onChange={() => undefined} onInvalid={() => { if (details.current) details.current.open = true; details.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); }} />}
  </span>;
}
