"use client";

import { useState } from "react";
import { useLocale } from "./locale-controller";
import type { SearchOption } from "./searchable-select";

export function SearchableMultiSelect({ label, options, value, onValueChange, required = false }: { label: string; options: readonly SearchOption[]; value: string[]; onValueChange: (values: string[]) => void; required?: boolean }) {
  const { english } = useLocale();
  const [query, setQuery] = useState("");
  const matches = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <span className="searchable-multi-select">
    {value.length > 0 && <span className="input-selected-tags">{value.map(id => <button type="button" data-form-change className="user-content" key={id} aria-label={`${english ? "Remove" : "移除"} ${options.find(option => option.value === id)?.label ?? id}`} onClick={() => onValueChange(value.filter(item => item !== id))}>{options.find(option => option.value === id)?.label ?? `#${id}`} ×</button>)}</span>}
    {options.length > 10 && <input type="search" value={query} aria-label={`${english ? "Search" : "搜索"} ${label}`} placeholder={english ? "Search…" : "搜索…"} onChange={event => setQuery(event.target.value)} />}
    <span className="searchable-multi-options" role="group" aria-label={label}>{matches.map(option => <label key={option.value}><input type="checkbox" checked={value.includes(option.value)} disabled={option.disabled} onChange={event => onValueChange(event.target.checked ? [...value, option.value] : value.filter(item => item !== option.value))} /><span className="user-content">{option.label}{option.detail && <small>{option.detail}</small>}</span></label>)}{!matches.length && <small>{english ? "No matches" : "没有匹配项"}</small>}</span>
    {required && !value.length && <input className="searchable-select-validation" aria-label={label} tabIndex={-1} required value="" onChange={() => undefined} onInvalid={event => event.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[type="search"],input[type="checkbox"]')?.focus()} />}
  </span>;
}
