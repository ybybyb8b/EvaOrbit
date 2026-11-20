"use client";

import { useRef, useState } from "react";
import { useLocale } from "./locale-controller";
import { matchesSearchOption, type SearchOption } from "./searchable-select";

export function SearchableMultiSelect({ label, options, value, onValueChange, required = false, showSelectedTags = true, alwaysSearch = false, hideSelectedOptions = false }: { label: string; options: readonly SearchOption[]; value: string[]; onValueChange: (values: string[]) => void; required?: boolean; showSelectedTags?: boolean; alwaysSearch?: boolean; hideSelectedOptions?: boolean }) {
  const { english } = useLocale();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const candidates = hideSelectedOptions && showSelectedTags ? options.filter(option => !value.includes(option.value)) : options;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = candidates.filter(option => matchesSearchOption(option, normalizedQuery));
  function toggleOption(id: string, checked: boolean) {
    onValueChange(checked ? [...value, id] : value.filter(item => item !== id));
    if (checked && hideSelectedOptions && showSelectedTags) {
      setQuery("");
      if (document.activeElement?.matches(":focus-visible")) search.current?.focus({ preventScroll: true });
    }
  }
  return <span className="searchable-multi-select">
    {showSelectedTags && value.length > 0 && <span className="input-selected-tags">{value.map(id => <button type="button" data-form-change className="user-content" key={id} aria-label={`${english ? "Remove" : "移除"} ${options.find(option => option.value === id)?.label ?? id}`} onClick={() => onValueChange(value.filter(item => item !== id))}>{options.find(option => option.value === id)?.label ?? `#${id}`} ×</button>)}</span>}
    {(alwaysSearch || options.length > 10) && <input ref={search} type="search" value={query} aria-label={`${english ? "Search" : "搜索"} ${label}`} placeholder={english ? "Search…" : "搜索…"} onChange={event => setQuery(event.target.value)} />}
    {(candidates.length > 0 || !options.length) && <span className="searchable-multi-options" role="group" aria-label={label}>{matches.map(option => <label key={option.value}><input type="checkbox" checked={value.includes(option.value)} disabled={option.disabled} onChange={event => toggleOption(option.value, event.target.checked)} /><span className="user-content">{option.label}{option.detail && <small>{option.detail}</small>}</span></label>)}{!matches.length && <small>{english ? "No matches" : "没有匹配项"}</small>}</span>}
    {required && !value.length && <input className="searchable-select-validation" aria-label={label} tabIndex={-1} required value="" onChange={() => undefined} onInvalid={event => event.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[type="search"],input[type="checkbox"]')?.focus()} />}
  </span>;
}
