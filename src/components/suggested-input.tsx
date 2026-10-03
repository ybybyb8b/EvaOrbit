"use client";

import { createContext, useContext, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-controller";
import { matchInputValues, parseInputTags } from "@/lib/form-input";

export const SheetSuggestionTarget = createContext<HTMLElement | null>(null);

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggestions: readonly string[];
  suggestionLabel: string;
  tags?: boolean;
};

export function SuggestedInput({ value, onValueChange, suggestions, suggestionLabel, tags = false, ...props }: Props) {
  const { english } = useLocale();
  const target = useContext(SheetSuggestionTarget);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const composing = useRef(false);
  const selected = tags ? parseInputTags(value) : [];
  // The partial tag is already in the parent value, so submitting without Enter loses nothing.
  const committed = tags && query ? parseInputTags(value.slice(0, -query.length).replace(/,\s*$/, "")) : selected;
  const matches = matchInputValues(suggestions, expanded ? searchQuery : tags ? query : value).filter(option => !tags || !committed.some(tag => tag.toLocaleLowerCase() === option.toLocaleLowerCase()));
  const candidates = tags ? matches : matchInputValues(suggestions, "");

  function pick(option: string) {
    if (composing.current || props.disabled || props.readOnly) return;
    setUndo(value);
    onValueChange(tags ? parseInputTags([...committed, option].join(", ")).join(", ") : option);
    setQuery("");
    setExpanded(false);
    input.current?.focus({ preventScroll: true });
  }
  const quick = <div className="input-recommendations" role="group" aria-label={suggestionLabel}>
    <span className="input-recommendations-label">{suggestionLabel}</span>
    <div className="input-recommendations-track">
      {candidates.slice(0, 5).map(option => <button type="button" data-form-change className="user-content" key={option} disabled={props.disabled || props.readOnly} onPointerDown={event => event.preventDefault()} onClick={() => pick(option)}>{option}</button>)}
      {candidates.length > 5 && <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => { setExpanded(true); setSearchQuery(""); input.current?.focus({ preventScroll: true }); input.current?.scrollIntoView({ block: "nearest" }); }}>{english ? "More" : "更多"}</button>}
      {undo !== null && <button type="button" data-form-change onPointerDown={event => event.preventDefault()} onClick={() => { onValueChange(undo); setUndo(null); setQuery(""); input.current?.focus({ preventScroll: true }); }}>{english ? "Undo" : "撤销"}</button>}
    </div>
  </div>;
  return <span className="suggested-input" ref={container} onBlur={event => {
    if (container.current?.contains(event.relatedTarget as Node) || target?.contains(event.relatedTarget as Node)) return;
    setFocused(false); setExpanded(false);
    if (tags) setQuery("");
  }}>
    {tags && committed.length > 0 && <span className="input-selected-tags">{committed.map(tag => <button key={tag} type="button" data-form-change className="user-content" aria-label={`${english ? "Remove" : "移除"} ${tag}`} disabled={props.disabled} onClick={() => { onValueChange([...committed.filter(value => value !== tag), ...(query ? [query] : [])].join(", ")); }}>{tag}<span aria-hidden="true"> ×</span></button>)}</span>}
    <span className="suggested-input-row"><input {...props} ref={input} aria-label={props["aria-label"] ?? suggestionLabel} value={tags ? query : value} autoComplete={props.autoComplete ?? "off"} aria-controls={expanded ? id : undefined}
      onFocus={event => { setFocused(true); props.onFocus?.(event); }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; if (tags && /[,，\n]/.test(event.currentTarget.value)) { onValueChange(parseInputTags(value).join(", ")); setQuery(""); } }}
      onChange={event => {
        setUndo(null);
        const next = event.target.value;
        setSearchQuery(next);
        if (tags) { const pasted = !composing.current && /[,，\n]/.test(next); setQuery(pasted ? "" : next); onValueChange(pasted ? parseInputTags([...committed, next].join(", ")).join(", ") : [...committed, next].join(", ")); }
        else onValueChange(next);
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current) return;
        if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
        if (event.key === "ArrowDown" && expanded) { event.preventDefault(); container.current?.querySelector<HTMLButtonElement>(".input-candidates button")?.focus(); }
        if (tags && event.key === "Enter") { event.preventDefault(); onValueChange(parseInputTags(value).join(", ")); setQuery(""); }
        props.onKeyDown?.(event);
      }} />
      {suggestions.length > 0 && <button type="button" className="input-candidates-toggle" aria-label={`${english ? "Suggestions for" : "查看推荐："} ${suggestionLabel}`} aria-expanded={expanded} aria-controls={id} disabled={props.disabled} onPointerDown={event => event.preventDefault()} onClick={() => { setExpanded(open => !open); setSearchQuery(""); input.current?.focus({ preventScroll: true }); }}>⌄</button>}
    </span>
    {expanded && <span id={id} className="input-candidates" role="group" aria-label={suggestionLabel} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setExpanded(false); input.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button")); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    }}>
      <small>{english ? "Type to filter · new values welcome" : "输入可筛选，也可直接填写新值"}</small>
      <input type="search" aria-label={`${english ? "Search" : "搜索"} ${suggestionLabel}`} placeholder={english ? "Search suggestions…" : "搜索推荐…"} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />
      {matches.map(option => <button type="button" data-form-change className="user-content" key={option} onPointerDown={event => event.preventDefault()} onClick={() => pick(option)}>{option}</button>)}
      {matches.length === 0 && <small>{english ? "No matches. You can keep your input." : "没有匹配项，可继续使用手填内容"}</small>}
    </span>}
    {focused && (candidates.length > 0 || undo !== null) && !props.disabled && !props.readOnly && (target ? createPortal(quick, target) : quick)}
  </span>;
}
