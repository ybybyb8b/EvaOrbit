"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Plus, ArrowRight2 } from "reicon-react";
import { PageHeading } from "@/components/page-heading";
import { FormSheet } from "@/components/form-sheet";
import { ChoiceSelect } from "@/components/choice-select";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { showActionToast } from "@/components/action-toast";
import { useServerDataState } from "@/components/use-data-refresh";
import { invalidateHomeCache } from "@/lib/home-cache";
import { invalidateClientData } from "@/lib/client-data-cache";
import { parseTimelineAssociation, type TimelineAssociationRule, type TimelineAssociationSettings } from "@/lib/timeline-association";
import { responseError } from "@/lib/response-error";
import type { Tracker } from "@/lib/types";

export function TimelineAssociationView({ settings: initialSettings, trackers, request = fetch, embedded = false, onSaved }: { settings: TimelineAssociationSettings; trackers: Tracker[]; request?: typeof fetch; embedded?: boolean; onSaved?: () => void }) {
  const { english } = useLocale();
  const [settings, setSettings] = useServerDataState(initialSettings);
  const [editor, setEditor] = useState<{ rule?: TimelineAssociationRule } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  async function save(rules: TimelineAssociationRule[]) {
    setBusy(true); setError(""); setConflict(false);
    try {
      const next = parseTimelineAssociation({ ...settings, rules });
      const response = await request("/api/timeline-association", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) { setConflict(response.status === 409); throw new Error(await responseError(response, english ? "Could not save rules. Try again." : "保存失败，请重试。")); }
      setSettings(parseTimelineAssociation(await response.json()));
      invalidateHomeCache(); invalidateClientData(["timeline-association"]); onSaved?.();
      showActionToast(english ? "Timeline rules saved" : "Timeline 关联规则已保存");
      setEditor(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try {
      const response = await request("/api/timeline-association", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not reload rules." : "无法刷新规则。"));
      const value = await response.json(); setSettings(parseTimelineAssociation(value.settings)); setConflict(false); setError("");
      // Keep a stale editor's draft, but prevent it from silently recreating a deleted rule.
      if (editor?.rule && !value.settings.rules.some((rule: TimelineAssociationRule) => rule.id === editor.rule!.id)) setError(english ? "This rule was deleted. Close the editor and add a new rule if needed." : "这条规则已删除，请关闭编辑器，按需新增规则。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  const feedback = <>{error && <ErrorNotice>{error}</ErrorNotice>}{conflict && <button type="button" className="button secondary" disabled={busy} onClick={() => void reload()}>{english ? "Reload rules, keep draft" : "刷新规则，保留草稿"}</button>}</>;
  return <div className="page settings-detail-page calendar-interpretation-page">
    <PageHeading eyebrow="" title={english ? "Timeline association rules" : "Timeline 关联规则"} description={english ? "Show Calendar and Tracker records of one activity together. Original records and statistics stay unchanged." : "将同一次活动的 Calendar 与 Tracker 记录合并展示，保留原始记录与统计。"} action={embedded ? undefined : <Link className="settings-back-link" href="/settings">{english ? "All settings" : "全部设置"}</Link>} />
    {!editor && feedback}
    <section className="calendar-rule-directory">
      <header><h2>{english ? "Association rules" : "关联规则"}</h2><button type="button" className="button secondary" disabled={busy} onClick={() => { setError(""); setEditor({}); }}><Plus size={16} weight="Outline" aria-hidden="true" />{english ? "Add rule" : "添加规则"}</button></header>
      <p className="calendar-rule-hint">{english ? "Only unique one-to-one matches merge. Conflicts, all-day events and uncertain times stay separate. Meal windows keep their existing Food association." : "仅合并唯一的一对一匹配。存在冲突、全天或时间不明确时保持分开；餐次日历沿用现有饮食关联。"}</p>
      <div className="calendar-rule-list">{settings.rules.map(rule => <button type="button" key={rule.id} className="calendar-rule-row" disabled={busy} onClick={() => { setError(""); setEditor({ rule }); }} aria-haspopup="dialog"><span><strong className="user-content">{rule.name}</strong><span>{rule.calendarTitle} → {trackers.find(tracker => tracker.id === rule.trackerId)?.name ?? (english ? "Tracker unavailable" : "Tracker 已不存在")} · {rule.enabled ? english ? "Enabled" : "已启用" : english ? "Disabled" : "已停用"}</span></span><ArrowRight2 size={17} weight="Outline" aria-hidden="true" /></button>)}</div>
      {!settings.rules.length && <p>{english ? "No rules yet. Add a Calendar title and choose a Tracker to start." : "还没有关联规则。添加日历标题并选择 Tracker，即可开始。"}</p>}
    </section>
    {editor && <RuleEditor key={editor.rule?.id ?? "new"} rule={editor.rule} trackers={trackers} busy={busy} onClose={() => { if (!busy) { setEditor(null); setError(""); setConflict(false); } }} feedback={feedback} onSave={rule => {
      if (editor.rule && !settings.rules.some(item => item.id === editor.rule!.id)) { setError(english ? "This rule no longer exists. Close the editor." : "这条规则已不存在，请关闭编辑器。"); return; }
      void save(rule ? editor.rule ? settings.rules.map(item => item.id === rule.id ? rule : item) : [...settings.rules, rule] : settings.rules.filter(item => item.id !== editor.rule?.id));
    }} />}
  </div>;
}

function RuleEditor({ rule, trackers, busy, feedback, onClose, onSave }: { rule?: TimelineAssociationRule; trackers: Tracker[]; busy: boolean; feedback: React.ReactNode; onClose: () => void; onSave: (rule: TimelineAssociationRule | null) => void }) {
  const { english } = useLocale();
  const [draft, setDraft] = useState<TimelineAssociationRule>(() => rule ?? { id: crypto.randomUUID(), type: "calendar_tracker", name: "", enabled: true, calendarTitle: "", titleMatch: "exact", trackerId: trackers.find(tracker => !tracker.archivedAt)?.id ?? 0, timeMatch: "near_end", toleranceMinutes: 5 });
  const [deleting, setDeleting] = useState(false);
  const patch = (value: Partial<TimelineAssociationRule>) => setDraft(current => ({ ...current, ...value }));
  function submit(event: FormEvent) { event.preventDefault(); onSave(draft); }
  return <FormSheet title={rule ? english ? "Edit association rule" : "编辑关联规则" : english ? "Add association rule" : "新增关联规则"} onClose={onClose} formId="timeline-association-form" submitLabel={english ? "Save rule" : "保存规则"} busy={busy} submitDisabled={!draft.trackerId || deleting}>
    <form id="timeline-association-form" className="calendar-rule-form" onSubmit={submit}>
      {feedback}
      <fieldset disabled={busy} className="home-journal-readonly-fields">
        <label className="field"><span>{english ? "Rule name" : "规则名称"}</span><input required autoFocus maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} placeholder={english ? "Shower" : "洗澡"} /></label>
        <label className="field"><span>{english ? "Association type" : "关联类型"}</span><ChoiceSelect value="calendar_tracker" disabled><option value="calendar_tracker">Calendar ↔ Tracker</option></ChoiceSelect></label>
        <label className="field"><span>{english ? "Calendar title" : "日历标题"}</span><input required maxLength={120} value={draft.calendarTitle} onChange={event => patch({ calendarTitle: event.target.value })} placeholder="洗香香" /></label>
        <label className="field"><span>{english ? "Title match" : "标题条件"}</span><ChoiceSelect value={draft.titleMatch} onChange={event => patch({ titleMatch: event.target.value as TimelineAssociationRule["titleMatch"] })}><option value="exact">{english ? "Exactly matches" : "完全匹配"}</option><option value="prefix">{english ? "Starts with" : "前缀匹配"}</option></ChoiceSelect></label>
        <label className="field"><span>Tracker</span><ChoiceSelect required value={draft.trackerId || ""} onChange={event => patch({ trackerId: Number(event.target.value) })}><option value="" disabled>{english ? "Choose a Tracker" : "选择 Tracker"}</option>{!trackers.some(tracker => tracker.id === draft.trackerId) && draft.trackerId > 0 && <option value={draft.trackerId}>{english ? "Tracker unavailable" : "Tracker 已不存在"}</option>}{trackers.map(tracker => <option key={tracker.id} value={tracker.id}>{tracker.name}{tracker.archivedAt ? english ? " (archived)" : "（已归档）" : ""}</option>)}</ChoiceSelect></label>
        <label className="field"><span>{english ? "Time condition" : "时间条件"}</span><ChoiceSelect value={draft.timeMatch} onChange={event => patch({ timeMatch: event.target.value as TimelineAssociationRule["timeMatch"] })}><option value="near_end">{english ? "Near Calendar end" : "接近日历结束时间"}</option><option value="within">{english ? "Inside Calendar interval" : "位于日历时段内"}</option><option value="range">{english ? "Matching start and end" : "起止时段一致"}</option></ChoiceSelect></label>
        <label className="field"><span>{english ? "Tolerance on each side (minutes)" : "前后容差（分钟）"}</span><input type="number" min={0} max={60} step={1} required value={Number.isFinite(draft.toleranceMinutes) ? draft.toleranceMinutes : ""} onChange={event => patch({ toleranceMinutes: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>
        <p className="calendar-rule-hint">{english ? "Uses the Tracker end time, or its recorded time for a point. Activities longer than 6 hours stay separate. Matching intervals also need at least 80% overlap." : "接近结束时使用 Tracker 结束时间；时间点记录使用记录时间。超过 6 小时的活动保持分开；时段一致还需至少 80% 重叠。"}</p>
        <label className="calendar-rule-toggle"><input role="switch" className="toggle-switch" type="checkbox" checked={draft.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span>{english ? "Enable this rule" : "启用这条规则"}</span></label>
        <p className="calendar-rule-hint">{english ? "Saving applies to historical Timeline views too. Records and business statistics are preserved." : "保存后也会应用于历史 Timeline，原始记录和业务统计保持不变。"}</p>
        {rule && (deleting ? <div role="group" aria-label={english ? "Confirm deletion" : "确认删除"}><p>{english ? "Delete this rule? Its automatic associations will stop. Original records are kept." : "删除这条规则？其自动关联将停止，原始记录保留。"}</p><button type="button" className="button secondary" onClick={() => setDeleting(false)}>{english ? "Cancel" : "取消"}</button><button type="button" className="button secondary" onClick={() => onSave(null)}>{english ? "Delete rule" : "确认删除规则"}</button></div> : <button type="button" className="button secondary" onClick={() => setDeleting(true)}>{english ? "Delete rule" : "删除规则"}</button>)}
      </fieldset>
    </form>
  </FormSheet>;
}
