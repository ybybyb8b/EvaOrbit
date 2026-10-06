"use client";

import { useEffect, useId, useState } from "react";
import { useLocale } from "./locale-controller";
import { ReiconSymbol } from "./reicon-symbol";

const common = ["Iphone", "Tv", "Gamepad", "Book", "Book2", "Pen", "Laptop", "Headphones", "Music", "Coffee", "ForkKnife", "Walk", "Run", "Dumbbell", "Heart", "MoonSleep", "Sun", "Car", "Train", "People"];
const aliases: Record<string, string> = { Iphone: "手机 phone", Tv: "电视电影 screen movie", Gamepad: "游戏 gaming", Book: "阅读读书 reading", Book2: "阅读读书 reading", Pen: "写作日记 writing", Laptop: "电脑工作 computer work", Headphones: "耳机音乐 music", Coffee: "咖啡", ForkKnife: "吃饭用餐 food", Walk: "散步运动", Run: "跑步运动", Dumbbell: "健身运动 gym", Heart: "爱心", MoonSleep: "睡眠 sleep", Sun: "太阳", Car: "开车汽车", Train: "火车", People: "社交朋友 social" };
const pageSize = 40;

export function ReiconPicker({ value, onChange, disabled = false }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const { english } = useLocale();
  const [open, setOpen] = useState(false), [names, setNames] = useState<string[] | null>(null), [query, setQuery] = useState(""), [page, setPage] = useState(0), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const panelId = useId(), searchId = useId();
  useEffect(() => {
    if (!open || names) return;
    const controller = new AbortController();
    fetch("/api/reicon", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load icons");
      const result = await response.json();
      if (!Array.isArray(result.names) || !result.names.every((name: unknown) => typeof name === "string" && /^[A-Z][A-Za-z0-9]*$/.test(name))) throw new Error("Invalid catalog");
      setNames(result.names); setError(false);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [open, names, retry]);
  const normalized = query.trim().toLowerCase().replace(/\s/g, "");
  const ordered = names ? [...common.filter(name => names.includes(name)), ...names.filter(name => !common.includes(name))] : [];
  const matches = ordered.filter(name => `${name} ${aliases[name] ?? ""}`.toLowerCase().replace(/\s/g, "").includes(normalized));
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);
  return <div className="calendar-icon-picker">
    <button type="button" className="calendar-icon-choice" disabled={disabled} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      {value && <ReiconSymbol name={value} size={24} />}<span>{value ?? (english ? "Use category name" : "显示分类名称")}</span><span>{english ? "Choose icon" : "选择图标"}</span>
    </button>
    {open && <div id={panelId} className="calendar-icon-browser">
      <label className="field" htmlFor={searchId}><span>{english ? "Search Reicon" : "搜索 Reicon"}</span><input id={searchId} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder={english ? "Phone, book, music…" : "手机、阅读，或英文图标名……"} disabled={disabled} /></label>
      {!names && !error && <p role="status">{english ? "Loading icons…" : "正在读取图标……"}</p>}
      {error && <p role="alert">{english ? "Could not load icons." : "图标加载失败。"} <button type="button" className="text-button" disabled={disabled} onClick={() => { setError(false); setRetry(retry + 1); }}>{english ? "Retry" : "重试"}</button></p>}
      {names && <>
        <div className="calendar-icon-grid" role="group" aria-label={english ? "Reicon icons" : "Reicon 图标"}>
          {visible.map(name => <button key={name} type="button" data-form-change aria-label={name} aria-pressed={value === name} title={name} disabled={disabled} onClick={() => { onChange(name); setOpen(false); }}><ReiconSymbol name={name} size={26} /><span>{name}</span></button>)}
        </div>
        <div className="calendar-icon-pagination"><button type="button" className="text-button" disabled={disabled || page === 0} onClick={() => setPage(page - 1)}>{english ? "Previous" : "上一页"}</button><span role="status">{matches.length ? `${page + 1} / ${Math.ceil(matches.length / pageSize)}` : english ? "No matches; try an English name" : "无匹配，试试英文图标名"}</span><button type="button" className="text-button" disabled={disabled || (page + 1) * pageSize >= matches.length} onClick={() => setPage(page + 1)}>{english ? "Next" : "下一页"}</button></div>
      </>}
      <button type="button" className="text-button" data-form-change disabled={disabled} onClick={() => { onChange(null); setOpen(false); }}>{english ? "Show category name instead" : "不使用图标，显示分类名称"}</button>
    </div>}
  </div>;
}
