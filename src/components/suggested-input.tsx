"use client";

import { createContext, useContext, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-controller";
import { matchInputValues, parseInputTags } from "@/lib/form-input";
import { Icon } from "./icons";
import { SelectDropdown } from "./select-dropdown";

export const SheetSuggestionTarget = createContext<HTMLElement | null>(null);

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggestions: readonly string[];
  suggestionLabel: string;
  tags?: boolean;
  recommendationStyle?: "list" | "chips" | "search";
};

export function SuggestedInput({ value, onValueChange, suggestions, suggestionLabel, tags = false, recommendationStyle = "search", ...props }: Props) {
  const { english } = useLocale();
  const target = useContext(SheetSuggestionTarget);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const composing = useRef(false);
  const skipFocusOpen = useRef(false);
  const selected = tags ? parseInputTags(value) : [];
  // The partial tag is already in the parent value, so submitting without Enter loses nothing.
  const committed = tags && query ? parseInputTags(value.slice(0, -query.length).replace(/,\s*$/, "")) : selected;
  const matches = matchInputValues(suggestions, expanded ? searchQuery : tags ? query : value).filter(option => !tags || !committed.some(tag => tag.toLocaleLowerCase() === option.toLocaleLowerCase()));
  const effectiveStyle = recommendationStyle === "chips" && suggestions.length > 5 ? "search" : recommendationStyle;
  const chipsOnly = effectiveStyle === "chips";
  const searchable = !chipsOnly && (!props.type || props.type === "text" || props.type === "search");
  const searchOnly = effectiveStyle === "search" && searchable;
  const candidates = tags ? matches : matchInputValues(suggestions, chipsOnly ? value : "");
  const newValue = searchQuery.trim();
  const canCreate = newValue.length > 0 && (!props.maxLength || newValue.length <= props.maxLength) && !suggestions.some(option => option.toLocaleLowerCase() === newValue.toLocaleLowerCase()) && !committed.some(tag => tag.toLocaleLowerCase() === newValue.toLocaleLowerCase());

  function pick(option: string) {
    if (composing.current || props.disabled || props.readOnly) return;
    setUndo(value);
    onValueChange(tags ? parseInputTags([...committed, option].join(", ")).join(", ") : option);
    setQuery("");
    if (document.activeElement !== input.current) skipFocusOpen.current = true;
    input.current?.focus({ preventScroll: true });
    setExpanded(false);
  }
  const quick = <div className="input-recommendations" role="group" aria-label={suggestionLabel}>
    <span className="input-recommendations-label">{suggestionLabel}</span>
    <div className="input-recommendations-track">
      {(chipsOnly && expanded ? candidates : candidates.slice(0, 5)).map(option => <button type="button" data-form-change className="user-content" key={option} disabled={props.disabled || props.readOnly} onPointerDown={event => event.preventDefault()} onClick={() => pick(option)}>{option}</button>)}
      {candidates.length > 5 && <button type="button" aria-expanded={expanded} onPointerDown={event => event.preventDefault()} onClick={() => { setExpanded(chipsOnly ? !expanded : true); setSearchQuery(""); input.current?.focus({ preventScroll: true }); input.current?.scrollIntoView({ block: "nearest" }); }}>{expanded && chipsOnly ? (english ? "Less" : "收起") : (english ? "More" : "更多")}</button>}
      {undo !== null && <button type="button" data-form-change onPointerDown={event => event.preventDefault()} onClick={() => { onValueChange(undo); setUndo(null); setQuery(""); input.current?.focus({ preventScroll: true }); }}>{english ? "Undo" : "撤销"}</button>}
    </div>
  </div>;
  return <span className="suggested-input" data-recommendation-style={effectiveStyle} ref={container} onBlur={event => {
    if (container.current?.contains(event.relatedTarget as Node) || (!searchOnly && target?.contains(event.relatedTarget as Node))) return;
    skipFocusOpen.current = false;
    setFocused(false); setExpanded(false);
    if (tags) setQuery("");
  }}>
    {tags && committed.length > 0 && <span className="input-selected-tags">{committed.map(tag => <button key={tag} type="button" data-form-change className="user-content" aria-label={`${english ? "Remove" : "移除"} ${tag}`} disabled={props.disabled} onClick={() => { onValueChange([...committed.filter(value => value !== tag), ...(query ? [query] : [])].join(", ")); }}>{tag}<span aria-hidden="true"> ×</span></button>)}</span>}
    <span className="suggested-input-row" ref={field}><input {...props} ref={input} aria-label={props["aria-label"] ?? suggestionLabel} value={tags ? query : value} autoComplete={props.autoComplete ?? "off"} role={searchable ? "combobox" : undefined} aria-autocomplete={searchable ? "list" : undefined} aria-controls={expanded ? id : undefined} aria-expanded={searchable ? expanded : undefined} aria-haspopup={searchable ? "listbox" : undefined}
      onFocus={event => { setFocused(true); if (skipFocusOpen.current) skipFocusOpen.current = false; else if (searchable && !props.disabled && !props.readOnly) { setSearchQuery(""); setExpanded(true); } props.onFocus?.(event); }}
      onClick={event => { if (searchable && !expanded && !props.disabled && !props.readOnly) { setSearchQuery(tags ? query : value); setExpanded(true); } props.onClick?.(event); }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; if (tags && /[,，\n]/.test(event.currentTarget.value)) { onValueChange(parseInputTags(value).join(", ")); setQuery(""); } }}
      onChange={event => {
        setUndo(null);
        const next = event.target.value;
        setSearchQuery(next);
        if (searchable) setExpanded(true);
        if (tags) { const pasted = !composing.current && /[,，\n]/.test(next); setQuery(pasted ? "" : next); onValueChange(pasted ? parseInputTags([...committed, next].join(", ")).join(", ") : [...committed, next].join(", ")); }
        else onValueChange(next);
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current) return;
        if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && searchable && !props.disabled && !props.readOnly) { event.preventDefault(); if (expanded) { const options = container.current?.querySelectorAll<HTMLButtonElement>('.eo-select-option'); const option = event.key === "ArrowDown" ? options?.[0] : options?.[options.length - 1]; option?.focus({ preventScroll: true }); option?.scrollIntoView({ block: "nearest" }); } else { setSearchQuery(tags ? query : value); setExpanded(true); } }
        if (tags && event.key === "Enter") { event.preventDefault(); onValueChange(parseInputTags(value).join(", ")); setQuery(""); }
        else if (event.key === "Enter" && searchable && expanded) { event.preventDefault(); const exact = matches.find(option => option.toLocaleLowerCase() === value.trim().toLocaleLowerCase()); if (exact) pick(exact); else if (canCreate) pick(newValue); else setExpanded(false); }
        props.onKeyDown?.(event);
      }} />
      {searchable && value && !props.readOnly && <button type="button" data-form-change className="input-value-clear" aria-label={`${english ? "Clear" : "清空"} ${suggestionLabel}`} disabled={props.disabled} onPointerDown={event => event.preventDefault()} onClick={() => { onValueChange(""); setQuery(""); setSearchQuery(""); input.current?.focus({ preventScroll: true }); setExpanded(true); }}>×</button>}
      {searchable && <span className="input-candidates-toggle" data-expanded={expanded} aria-hidden="true"><Icon name="chevronDown"/></span>}
    </span>
    {expanded && searchable && !props.disabled && !props.readOnly && <SelectDropdown anchor={field} onClose={() => { if (container.current?.querySelector('.eo-select-dropdown')?.contains(document.activeElement)) skipFocusOpen.current = true; setExpanded(false); }} id={id} label={suggestionLabel}>
      <div className="eo-select-results" role="listbox" aria-label={suggestionLabel}>
        {matches.map(option => <button type="button" data-form-change className="eo-select-option user-content" role="option" aria-selected={tags ? selected.includes(option) : value === option} key={option} onPointerDown={event => event.preventDefault()} onClick={() => pick(option)}><span>{option}</span><span className="eo-select-check" aria-hidden="true">{value === option ? "✓" : ""}</span></button>)}
        {canCreate && <button type="button" data-form-change className="eo-select-option eo-select-create user-content" role="option" aria-selected={false} onPointerDown={event => event.preventDefault()} onClick={() => pick(newValue)}><span>{english ? `Create “${newValue}”` : `创建「${newValue}」`}</span><span aria-hidden="true">＋</span></button>}
        {!matches.length && !canCreate && <small className="eo-select-empty">{english ? "Type to search or create a value" : "输入以搜索或创建新值"}</small>}
      </div>
    </SelectDropdown>}
    {!searchOnly && focused && (candidates.length > 0 || undo !== null) && !props.disabled && !props.readOnly && (target ? createPortal(quick, target) : quick)}
  </span>;
}
