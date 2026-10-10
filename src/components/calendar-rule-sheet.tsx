"use client";
import { ChoiceSelect } from "@/components/choice-select";
import { SearchableSelect } from "./searchable-select";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "./form-sheet";
import { useLocale } from "./locale-controller";
import { calendarCategoryIcon, calendarCategoryLabel, normalizedCalendarPrefix, parseCalendarInterpretation, suggestedCalendarPrefix, type CalendarInterpretation, type CalendarRule } from "@/lib/calendar-interpretation";
import { ReiconPicker } from "./reicon-picker";
import { ReiconSymbol } from "./reicon-symbol";
import { homeDurationLabel } from "@/lib/home-day";
import type { CalendarEvent } from "@/lib/types";

export function CalendarRuleSheet({ settings, rule, records, initialTitle, onClose, onSaved }: { settings: CalendarInterpretation; rule?: CalendarRule; records: CalendarEvent[]; initialTitle?: string; onClose: () => void; onSaved: (settings: CalendarInterpretation) => void | Promise<void> }) {
  const { english } = useLocale();
  const router = useRouter();
  const [base, setBase] = useState(settings), [prefix, setPrefix] = useState(rule?.prefix ?? suggestedCalendarPrefix(initialTitle ?? ""));
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "phone"), [newName, setNewName] = useState("");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true), [include, setInclude] = useState(rule?.includeInSummary ?? true);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [mealType, setMealType] = useState<CalendarRule["mealType"] | "">(rule?.mealType ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const category = base.categories.find(item => item.id === categoryId), isSleep = category?.kind === "sleep";
  const icon = Object.hasOwn(icons, categoryId) ? icons[categoryId] : category ? calendarCategoryIcon(category) : null;
  const matches = normalizedCalendarPrefix(prefix) ? records.filter(record => normalizedCalendarPrefix(record.title).startsWith(normalizedCalendarPrefix(prefix))) : [];
  const collision = enabled && normalizedCalendarPrefix(prefix) ? base.rules.find(item => item.id !== rule?.id && item.enabled && (normalizedCalendarPrefix(item.prefix).startsWith(normalizedCalendarPrefix(prefix)) || normalizedCalendarPrefix(prefix).startsWith(normalizedCalendarPrefix(item.prefix)))) : null;

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setConflict(false);
    try {
      let nextCategoryId = categoryId, categories = base.categories;
      if (categoryId === "new") {
        const existing = categories.find(item => item.name.normalize("NFC").toLowerCase() === newName.trim().normalize("NFC").toLowerCase());
        nextCategoryId = existing?.id ?? `custom-${crypto.randomUUID()}`;
        if (!existing) categories = [...categories, { id: nextCategoryId, name: newName.trim(), kind: "activity" }];
      }
      categories = categories.map(item => {
        const key = categoryId === "new" && item.id === nextCategoryId ? "new" : item.id;
        return Object.hasOwn(icons, key) ? { ...item, icon: icons[key] } : item;
      });
      const updated: CalendarRule = { id: rule?.id ?? crypto.randomUUID(), prefix: prefix.trim(), categoryId: nextCategoryId, enabled, includeInSummary: categories.find(item => item.id === nextCategoryId)?.kind !== "sleep" && include, ...(mealType ? { mealType } : {}) };
      const next = parseCalendarInterpretation({ ...base, categories, rules: rule ? base.rules.map(item => item.id === rule.id ? updated : item) : [...base.rules, updated] });
      const response = await fetch("/api/calendar-interpretation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const result = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(result.error || (english ? "Could not save rules" : "无法保存规则")); }
      await onSaved(result as CalendarInterpretation); router.refresh(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : english ? "Could not save rules" : "无法保存规则"); }
    finally { setBusy(false); }
  }

  async function reloadRules() {
    setBusy(true);
    try {
      const response = await fetch("/api/calendar-interpretation", { cache: "no-store" });
      if (!response.ok) throw new Error(english ? "Could not reload rules" : "无法重新读取规则");
      const result = await response.json();
      if (rule && !result.settings.rules.some((item: CalendarRule) => item.id === rule.id)) throw new Error(english ? "This rule no longer exists. Close and reopen the editor." : "这条规则已不存在，请关闭后重新打开。");
      setBase(result.settings); setConflict(false); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取规则"); }
    finally { setBusy(false); }
  }

  return <FormSheet title={rule ? english ? "Edit interpretation rule" : "编辑解读规则" : english ? "Define interpretation" : "定义解读方式"} onClose={onClose} formId="calendar-rule-form" submitLabel={english ? "Save rule" : "保存规则"} busy={busy}>
    <form id="calendar-rule-form" className="calendar-rule-form" onSubmit={save}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {conflict && <button className="button secondary" type="button" disabled={busy} onClick={() => void reloadRules()}>{english ? "Reload rules, keep draft" : "刷新规则，保留草稿"}</button>}
      <label className="field"><span>{english ? "Title starts with" : "标题以什么开头"}</span><input required autoFocus maxLength={80} value={prefix} onChange={event => setPrefix(event.target.value)} disabled={busy} placeholder={english ? "Emoji or text prefix" : "emoji 或文字前缀"} /></label>
      <div className="field"><span>{english ? "Meaning in EO" : "在 EO 中代表什么"}</span>{base.categories.length > 10 ? <SearchableSelect label={english?"Meaning in EO":"在 EO 中代表什么"} value={categoryId} disabled={busy} options={[...base.categories.map(item=>({value:item.id,label:calendarCategoryLabel(item,english)})),{value:"new",label:english?"New category…":"新建分类……"}]} onValueChange={setCategoryId}/> : <ChoiceSelect value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={busy}>{base.categories.map(item => <option key={item.id} value={item.id}>{calendarCategoryLabel(item, english)}</option>)}<option value="new">{english ? "New category…" : "新建分类……"}</option></ChoiceSelect>}</div>
      {categoryId === "new" && <label className="field"><span>{english ? "Category name" : "分类名称"}</span><input required maxLength={60} value={newName} onChange={event => setNewName(event.target.value)} disabled={busy} placeholder={english ? "Reading, study…" : "阅读、学习……"} /></label>}
      {!isSleep && <div className="field"><span>{english ? "Category display icon" : "分类显示图标"}</span><ReiconPicker value={icon} onChange={value => setIcons(current => ({ ...current, [categoryId]: value }))} disabled={busy} /><p className="calendar-rule-hint">{english ? "Shared by all prefixes in this category. Saving updates today's and historical summaries." : "同一分类的所有前缀共用此图标。保存后，今日及历史用时总结都会更新。"}</p></div>}
      <label className="calendar-rule-toggle"><input role="switch" className="toggle-switch" type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy} /><span>{english ? "Enable this rule" : "启用这条规则"}</span></label>
      {!isSleep && <label className="field"><span>{english ? "Match Food meal times" : "关联饮食的用餐时间"}</span><ChoiceSelect value={mealType} onChange={event => setMealType(event.target.value as typeof mealType)} disabled={busy}><option value="">{english ? "Not a meal window" : "不是用餐时段"}</option><option value="auto">{english ? "Meal · match automatically" : "用餐 · 自动匹配餐次"}</option><option value="breakfast">{english ? "Breakfast" : "早餐"}</option><option value="lunch">{english ? "Lunch" : "午餐"}</option><option value="dinner">{english ? "Dinner" : "晚餐"}</option><option value="snack">{english ? "Snack" : "加餐"}</option><option value="late_night">{english ? "Late night" : "夜宵"}</option></ChoiceSelect>{mealType && <p className="calendar-rule-hint">{english ? "Matched Food records use this event's interval; Timeline shows one meal. Unmatched records stay visible." : "匹配的饮食记录自动采用此事项时段，Timeline 只显示一顿饭；未匹配记录仍正常显示。"}</p>}</label>}
      {!isSleep ? <label className="calendar-rule-toggle"><input role="switch" className="toggle-switch" type="checkbox" checked={include} onChange={event => setInclude(event.target.checked)} disabled={busy} /><span>{english ? "Include in daily recorded-time summary" : "加入每日用时总结"}</span></label> : <p className="calendar-rule-hint">{english ? "Sleep records contribute to the sleep card, including naps." : "睡眠记录用于睡眠卡片，包含主睡眠和小睡。"}</p>}
      {collision && <p className="form-error" role="alert">{english ? `Prefix conflicts with “${collision.prefix}”. Edit that rule or use another prefix.` : `前缀与「${collision.prefix}」冲突，请编辑已有规则或换一个前缀。`}</p>}
      <section className="calendar-rule-preview" aria-label={english ? "Interpretation preview" : "解读预览"}>
        <h3>{english ? "Preview" : "解读预览"}</h3>
        {!isSleep && <div className="calendar-icon-preview">{icon && <ReiconSymbol name={icon} size={24} />}<span>{categoryId === "new" ? newName.trim() || (english ? "New category" : "新分类") : category ? calendarCategoryLabel(category, english) : "…"}</span></div>}
        <p>{!enabled ? english ? "Disabled: these events remain in Timeline, without this interpretation." : "已停用：事项仍保留在 Timeline，不使用这条解读。" : english ? `Match “${prefix.trim() || "…"}” → ${categoryId === "new" ? newName.trim() || "New category" : category ? calendarCategoryLabel(category, true) : "…"}` : `标题开头「${prefix.trim() || "……"}」→ ${categoryId === "new" ? newName.trim() || "新分类" : category?.name || "……"}`}</p>
        {matches.length ? <ul>{matches.slice(0, 5).map(record => {
          const minutes = (Date.parse(record.endAt) - Date.parse(record.startAt)) / 60_000, counted = enabled && record.status === "confirmed" && !record.isAllDay && minutes > 0 && (isSleep || include);
          return <li key={record.id}><strong className="user-content">{record.title}</strong><span>{counted ? homeDurationLabel(Math.round(minutes), english) : english ? "Not included in duration totals" : "不计入时长统计"}</span></li>;
        })}</ul> : <p className="calendar-rule-hint">{english ? "No matches in the available recent examples. You can still save this rule." : "最近的示例中没有匹配事项，仍可保存规则。"}</p>}
        <p className="calendar-rule-hint">{english ? "Preview uses full event intervals; daily totals clip activities to the selected date. Comments and title durations are not parsed." : "预览使用完整事件时段；每日用时按所选日期切分。不解析评论或标题里的时长。"}</p>
      </section>
      <p className="calendar-rule-impact">{english ? "Saving also reinterprets historical records. Original titles, comments and times stay unchanged; no other EO records are created." : "保存后，历史记录也会按新规则解读。原始标题、评论和时间不变，不会生成另一份 EO 记录。"}</p>
    </form>
  </FormSheet>;
}

export function CalendarRuleSummary({ settings, rule }: { settings: CalendarInterpretation; rule: CalendarRule }) {
  const { english } = useLocale(), category = settings.categories.find(item => item.id === rule.categoryId);
  return <><strong className="user-content">{rule.prefix}<span aria-hidden="true"> → </span>{category ? calendarCategoryLabel(category, english) : rule.categoryId}</strong><span>{!rule.enabled ? english ? "Disabled" : "已停用" : category?.kind === "sleep" ? english ? "Sleep card" : "睡眠卡片" : rule.includeInSummary ? english ? "Daily recorded time" : "每日用时总结" : english ? "Classification only" : "仅分类，不加入用时总结"}</span></>;
}
