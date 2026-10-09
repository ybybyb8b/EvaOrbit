"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { SelectDropdown } from "@/components/select-dropdown";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { id: number; name: string; detail?: string };
export function FoodLinkPicker({ itemType, label, options, selected, multiple = false, onSearch, onChange, loading = false, error, onRetry }: { itemType?: "place"|"food"|"drink"; label: string; options: Option[]; selected: number[]; multiple?: boolean; onSearch: (query: string) => void; onChange: (ids: number[]) => void; loading?: boolean; error?: string; onRetry?: () => void }) {
  const id = useId();
  const type = itemType??(multiple?"food":"place");
  const noun=type==="place"?"店铺":type==="drink"?"饮品":"菜品";
  const details = useRef<HTMLDetailsElement>(null);
  const [open,setOpen]=useState(false);
  const [query, setQuery] = useState("");
  function closeMenu() {
    if (!details.current) return;
    setOpen(false); details.current.open = false;
    details.current.querySelector("summary")?.focus();
  }
  const picked = options.filter(option => selected.includes(option.id));
  const matches = options.filter(option => `${option.name} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (!multiple) return <div className="field food-link-field"><span>{label}</span><SearchableSelect label={label} value={selected[0]?.toString()??""} options={[{value:"",label:`未关联${noun}`},...options.map(option=>({value:String(option.id),label:option.name,detail:option.detail}))]} onValueChange={value=>onChange(value?[Number(value)]:[])} onSearch={onSearch} loading={loading} error={error} onRetry={onRetry}/></div>;
  return <div className="field food-link-field"><span id={`${id}-label`}>{label}</span>
    <details ref={details} className="food-link-picker" onToggle={event=>setOpen(event.currentTarget.open)} onKeyDown={event => { if (event.key === "Escape" && details.current?.open) { event.preventDefault(); event.stopPropagation(); closeMenu(); } }}>
      <summary aria-expanded={open} aria-controls={open?`${id}-options`:undefined} aria-labelledby={`${id}-label ${id}-value`}><span id={`${id}-value`} className="user-content">{multiple ? selected.length ? `已选择 ${selected.length} 道菜品` : "选择菜品，可多选" : picked[0] ? [picked[0].name, picked[0].detail].filter(Boolean).join(" · ") : `未关联${noun}`}</span><Icon name="chevronDown"/></summary>
      {open&&<SelectDropdown anchor={details} id={`${id}-options`} label={label} onClose={closeMenu}><div className="food-link-menu"><input className="eo-select-search" type="search" aria-label={`搜索${noun}`} placeholder={type!=="place" ? `搜索${noun}名称、品类` : "搜索店名、城市、地点"} value={query} onChange={event => { setQuery(event.target.value); onSearch(event.target.value); }} />
        <div className="food-link-options">
          {!multiple && <button type="button" data-form-change onClick={() => { onChange([]); closeMenu(); setQuery(""); onSearch(""); }}>未关联{noun}</button>}
          {matches.map(option => multiple ? <label className="food-link-option" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(value => value !== option.id))} /><span className="user-content">{option.name}{option.detail && <small>{option.detail}</small>}</span></label> : <button type="button" data-form-change className="user-content" key={option.id} aria-pressed={selected.includes(option.id)} onClick={() => { onChange([option.id]); closeMenu(); setQuery(""); onSearch(""); }}>{option.name}{option.detail && <small>{option.detail}</small>}</button>)}
          {loading && <p role="status">正在搜索…</p>}
          {error && <div role="alert"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry}>重试</button>}</div>}
          {!loading && !error && !matches.length && <p className="food-link-empty">{query ? "没有匹配的结果" : type!=="place" ? `这家店还没有${noun}菜单` : "还没有店铺"}</p>}
        </div>
        {multiple && <button type="button" onClick={closeMenu}>选好了 · {selected.length}</button>}
      </div></SelectDropdown>}
    </details>
    {multiple && picked.length > 0 && <div className="food-linked-dishes">{picked.map(option => <button type="button" data-form-change className="user-content" key={option.id} aria-label={`移除 ${option.name}`} onClick={() => onChange(selected.filter(value => value !== option.id))}>{option.name}<span aria-hidden="true"> ×</span></button>)}</div>}
  </div>;
}
