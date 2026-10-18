"use client";

import { ErrorNotice } from "@/components/error-notice";
import { useRef, useState } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { TRAINING_BODY_PARTS, type TrainingPlan, type TrainingPlanDay, type TrainingType } from "@/lib/types";
import { parseTrainingPlanWrite, retainedTrainingDay, trainingTemplate } from "@/lib/training-plan";
import { trainingBodyPartLabels, trainingTypeLabels } from "./training-log-editor";

export function TrainingPlanEditor({ plan, onSaved, onClose }: { plan: TrainingPlan | null; onSaved: (plan: TrainingPlan) => void; onClose: () => void }) {
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  const [draft, setDraft] = useState(() => plan ?? { ...trainingTemplate(), version: 0, updatedAt: "" });
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [expandedDayId, setExpandedDayId] = useState<string | null>(() => plan?.currentDayId ?? plan?.days[0]?.id ?? (plan ? null : "day-1"));
  const [errorDayId, setErrorDayId] = useState<string | null>(null);
  function updateDay(id: string, patch: Partial<TrainingPlanDay>) { setDraft(current => ({ ...current, days: current.days.map(day => day.id === id ? { ...day, ...patch } : day) })); }
  function replaceDays(days: TrainingPlanDay[]) {
    setDraft(current => ({ ...current, days, currentDayId: retainedTrainingDay(current.days, days, current.currentDayId) }));
    setExpandedDayId(current => days.some(day => day.id === current) ? current : retainedTrainingDay(draft.days, days, current));
  }
  function addDay() {
    const day: TrainingPlanDay = { id: crypto.randomUUID(), name: "", trainingType: "mixed", bodyParts: [], durationMinutes: null, content: "", videoUrls: [] };
    replaceDays([...draft.days, day]); setExpandedDayId(day.id);
    requestAnimationFrame(() => document.getElementById(`training-day-${day.id}-name`)?.focus());
  }
  function move(index: number, offset: number) {
    const days = [...draft.days];
    [days[index], days[index + offset]] = [days[index + offset], days[index]];
    replaceDays(days);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError(""); setErrorDayId(null);
    try {
      const days = draft.days.map((day, index) => {
        try {
          return parseTrainingPlanWrite({ name: draft.name.trim() || "Plan", days: [{ ...day, videoUrls: day.videoUrls.map(url => url.trim()).filter(Boolean) }], currentDayId: day.id, expectedVersion: draft.version }).days[0];
        } catch (error) {
          setExpandedDayId(day.id); setErrorDayId(day.id);
          requestAnimationFrame(() => document.getElementById(`training-day-${day.id}`)?.scrollIntoView({ block: "nearest" }));
          throw new Error(`Day ${index + 1} · ${error instanceof Error ? error.message : t("Check this day", "请检查训练日内容")}`);
        }
      });
      const payload = parseTrainingPlanWrite({ ...draft, days, expectedVersion: draft.version });
      lock.current = true; setSaving(true);
      const response = await fetch("/api/health/training/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? t("Could not save plan", "未能保存计划")); return; }
      onSaved(result); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : t("Could not save plan", "未能保存计划")); }
    finally { lock.current = false; setSaving(false); }
  }
  return <FormSheet title={t("Edit training plan", "编辑训练计划")} onClose={onClose} formId="training-plan-form" submitLabel={t("Save plan", "保存计划")} busy={saving}>
    <form id="training-plan-form" className="training-form training-plan-form" onSubmit={event => void submit(event)} onInvalidCapture={event => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      const day = field.closest<HTMLDetailsElement>(".training-plan-day");
      if (!day) return;
      event.preventDefault();
      const dayId = day.id.slice("training-day-".length);
      setExpandedDayId(dayId); setErrorDayId(dayId);
      setError(field.validity.valueMissing ? t("Fill in this field before saving.", "请填写此项后再保存。") : field.validationMessage);
      requestAnimationFrame(() => { field.focus(); field.scrollIntoView({ block: "nearest" }); });
    }}>
      <label className="field"><span>{t("Plan name", "计划名称")}</span><input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="training-plan-list-heading"><strong>{t(`${draft.days.length} training days`, `${draft.days.length} 个训练日`)}</strong><span>{t("In order · No fixed dates", "按顺序循环 · 不限日期")}</span></div>
      {error && !errorDayId && <ErrorNotice role="alert">{error}</ErrorNotice>}
      <div className="training-plan-days">{draft.days.map((day, index) => <details className="training-plan-day" key={day.id} id={`training-day-${day.id}`} open={expandedDayId === day.id} onToggle={event => {
        const open = event.currentTarget.open;
        setExpandedDayId(current => open ? day.id : current === day.id ? null : current);
      }}>
        <summary><span className="training-plan-day-number">Day {index + 1}</span><span className="training-plan-day-summary"><strong>{day.name || t("Untitled training day", "未命名训练日")}</strong><small>{[trainingTypeLabels[day.trainingType][english ? "en" : "zh"], day.durationMinutes ? `${day.durationMinutes} ${t("min", "分钟")}` : "", day.videoUrls.filter(url => url.trim()).length ? t(`${day.videoUrls.filter(url => url.trim()).length} videos`, `${day.videoUrls.filter(url => url.trim()).length} 个视频`) : ""].filter(Boolean).join(" · ")}</small></span><Icon name="chevronDown" /></summary>
        <fieldset className="training-plan-day-body" disabled={saving}>
          <legend className="sr-only">{t("Edit", "编辑")} Day {index + 1}</legend>
          {error && errorDayId === day.id && <ErrorNotice role="alert">{error}</ErrorNotice>}
          <div className="training-plan-basics">
            <label className="field"><span>{t("Day name", "训练日名称")}</span><input id={`training-day-${day.id}-name`} required maxLength={120} value={day.name} onChange={event => updateDay(day.id, { name: event.target.value })} /></label>
            <label className="field"><span>{t("Minutes", "预计分钟")} <small>{t("Optional", "可选")}</small></span><input type="number" inputMode="numeric" min={1} max={1440} step={1} placeholder="—" value={day.durationMinutes ?? ""} onChange={event => updateDay(day.id, { durationMinutes: event.target.value ? Number(event.target.value) : null })} /></label>
          </div>
          <label className="field"><span>{t("Training type", "训练类型")}</span><ChoiceSelect value={day.trainingType} onChange={event => updateDay(day.id, { trainingType: event.target.value as TrainingType })}>{Object.entries(trainingTypeLabels).map(([value, labels]) => <option key={value} value={value}>{labels[english ? "en" : "zh"]}</option>)}</ChoiceSelect></label>
          <fieldset className="training-body-field"><legend>{t("Training areas", "训练部位")}</legend><div className="training-body-parts">{TRAINING_BODY_PARTS.map(part => <button type="button" key={part} className={day.bodyParts.includes(part) ? "active" : ""} aria-pressed={day.bodyParts.includes(part)} data-form-change onClick={() => updateDay(day.id, { bodyParts: day.bodyParts.includes(part) ? day.bodyParts.filter(item => item !== part) : [...day.bodyParts, part] })}>{trainingBodyPartLabels[part][english ? "en" : "zh"]}</button>)}</div></fieldset>
          <label className="field"><span>{t("Training content", "训练内容")}</span><textarea rows={3} maxLength={2500} value={day.content} onChange={event => updateDay(day.id, { content: event.target.value })} /></label>
          <div className="field training-plan-links"><div className="training-plan-links-heading"><span>{t("Video links", "视频链接")} <small>{t("Optional", "可选")}</small></span>{day.videoUrls.length > 0 && <small>{day.videoUrls.length}/8</small>}</div>
            {day.videoUrls.map((url, videoIndex) => <div className="training-plan-link-row" key={videoIndex}><input type="url" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={250} aria-label={`${t("Video link", "视频链接")} ${videoIndex + 1}`} placeholder="https://" value={url} onChange={event => updateDay(day.id, { videoUrls: day.videoUrls.map((value, i) => i === videoIndex ? event.target.value : value) })} /><button type="button" className="icon-button subtle" aria-label={`${t("Remove video link", "删除视频链接")} ${videoIndex + 1}`} data-form-change onClick={() => updateDay(day.id, { videoUrls: day.videoUrls.filter((_, i) => i !== videoIndex) })}><Icon name="close" /></button></div>)}
            <button type="button" className="text-button training-plan-add-link" disabled={day.videoUrls.length >= 8} data-form-change onClick={() => updateDay(day.id, { videoUrls: [...day.videoUrls, ""] })}><Icon name="plus" />{t("Add video link", "添加视频链接")}</button>
          </div>
          <div className="training-plan-day-actions"><div>
            <button type="button" className="text-button" disabled={index === 0} data-form-change onClick={() => move(index, -1)} aria-label={`${t("Move up", "上移")} Day ${index + 1}`}><Icon name="arrow" />{t("Move up", "上移")}</button>
            <button type="button" className="text-button" disabled={index === draft.days.length - 1} data-form-change onClick={() => move(index, 1)} aria-label={`${t("Move down", "下移")} Day ${index + 1}`}><Icon name="arrow" />{t("Move down", "下移")}</button>
          </div><button type="button" className="text-button training-plan-remove-day" data-form-change onClick={() => replaceDays(draft.days.filter(item => item.id !== day.id))} aria-label={`${t("Remove", "删除")} Day ${index + 1}`}><Icon name="trash" />{t("Remove day", "删除此日")}</button></div>
        </fieldset>
      </details>)}</div>
      {!draft.days.length && <div className="training-plan-empty"><strong>{t("Build your first training day", "添加第一个训练日")}</strong><p>{t("Start with a name and training areas. Videos and duration are optional.", "填写名称和训练部位即可，视频与时长可稍后补充。")}</p></div>}
      <button type="button" className="button secondary training-plan-add-day" disabled={saving || draft.days.length >= 30} data-form-change onClick={addDay}><Icon name="plus" />{t("Add training day", "添加训练日")}</button>
    </form>
  </FormSheet>;
}
