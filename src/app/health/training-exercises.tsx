"use client";

import { Fragment, type ReactNode } from "react";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { SuggestedInput, type SuggestionActions } from "@/components/suggested-input";
import type { TrainingExerciseLog, TrainingExercisePreset } from "@/lib/types";
import { adjustTrainingExercise, exerciseTarget, exerciseTargetParts, reuseTrainingExercises, trainingExerciseKey, type ExerciseSide } from "@/lib/training-session";

export function TrainingExercises({ items, onChange, suggestions = [], suggestionActions, presets = [], previous = [], title, children, recording = false }: { items: TrainingExerciseLog[]; onChange: (items: TrainingExerciseLog[]) => void; suggestions?: string[]; suggestionActions?: SuggestionActions; presets?: TrainingExercisePreset[]; previous?: TrainingExercisePreset[]; title?: string; children?: ReactNode; recording?: boolean }) {
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  function update(id: string, patch: Partial<TrainingExerciseLog>) {
    onChange(items.map(item => {
      if (item.id !== id) return item;
      return adjustTrainingExercise(item, patch);
    }));
  }
  const currentNames = new Set(items.map(trainingExerciseKey));
  const available = presets.filter(item => !currentNames.has(trainingExerciseKey(item)));
  const canReuse = previous.some(item => !currentNames.has(trainingExerciseKey(item))) && items.length < 30;
  return <section className="training-exercises" aria-label={title ?? t("Exercise plan", "动作安排")}>
    <div className="training-plan-links-heading"><span>{title ?? t("Exercise plan", "动作安排")}</span><small>{t("Optional", "可选")}</small></div>
    {canReuse && !items.length && <button type="button" className="text-button training-reuse-previous" data-form-change onClick={() => onChange(reuseTrainingExercises(items, previous))}><Icon name="history" /><span><strong>{t("Reuse last exercises", "沿用上次动作")}</strong><small>{previous.map(item => item.name).join(" · ")}</small></span><span className="training-reuse-count">{previous.length}</span></button>}
    {available.length > 0 && items.length < 30 && <Disclosure className="training-exercise-history" title={t("Add from history", "从历史动作添加")} defaultOpen={!recording}><div>{available.slice(0, 8).map(preset => <button type="button" className="text-button" data-form-change key={trainingExerciseKey(preset)} onClick={() => onChange(reuseTrainingExercises(items, [preset]))}>{preset.name}<small>{preset.phase === "warmup" ? t("Warm-up · ", "热身 · ") : ""}{[preset.sets ? `${preset.sets} ${t("sets", "组")}` : "", preset.target].filter(Boolean).join(" × ")}</small></button>)}</div></Disclosure>}
    {!items.length && <p className="training-plan-hint">{t("Add an exercise once. Next time, its sets, reps and side are ready to reuse.", "动作只需填一次，下次直接沿用组数、次数和单／双侧。")}</p>}
    {(["warmup", "training"] as const).map(phase => <Fragment key={phase}>{phase === "training" && children}{items.some(item => (item.phase ?? "training") === phase) && <div className="training-exercise-group"><h4>{phase === "warmup" ? t("Warm-up", "热身") : t("Main training", "正式训练")}</h4>{items.filter(item => (item.phase ?? "training") === phase).map(item => { const index = items.indexOf(item); const target = exerciseTargetParts(item.target); const fields = <div className="training-exercise-fields-body">
      <div className="training-exercise-name"><div className="field"><span>{t("Exercise name", "动作名称")}</span><SuggestedInput suggestionLabel={t(`Exercise ${index + 1}`, `动作 ${index + 1}`)} value={item.name} maxLength={120} required suggestions={suggestions} suggestionActions={suggestionActions} onValueChange={name => update(item.id, { name })} /></div><button type="button" className="icon-button subtle" data-form-change aria-label={t(`Remove exercise ${index + 1}`, `删除动作 ${index + 1}`)} onClick={() => onChange(items.filter(exercise => exercise.id !== item.id))}><Icon name="close" /></button></div>
      <button type="button" className="text-button training-exercise-move" data-form-change onClick={() => update(item.id, { phase: phase === "warmup" ? "training" : "warmup" })}>{phase === "warmup" ? t("Move to main training", "移至正式训练") : t("Move to warm-up", "移至热身")}</button>
      <div className="training-exercise-target"><label className="field"><span>{t("Sets", "组数")}</span><input type="number" inputMode="numeric" min={1} max={50} step={1} placeholder={t("Optional", "可选")} value={item.sets ?? ""} onChange={event => update(item.id, { sets: event.target.value ? Number(event.target.value) : null })} /></label><label className="field"><span>{target.side === "single" ? t("Reps / time per side", "每侧次数 / 时长") : t("Reps / duration", "每组次数 / 时长")}</span><input maxLength={target.side === "unspecified" ? 120 : 115} placeholder={t("e.g. 12 reps / 30 sec", "如 12 次 / 30 秒")} value={target.reps} onChange={event => update(item.id, { target: exerciseTarget(target.side, event.target.value) })} /></label>
      <div className="field training-exercise-side-field"><span>{t("Side", "侧别")}</span><div className="training-exercise-side" role="group" aria-label={t(`Exercise ${index + 1} side`, `动作 ${index + 1} 单／双侧`)}>{(["single", "both"] as ExerciseSide[]).map(side => <button key={side} type="button" className={target.side === side ? "active" : ""} aria-pressed={target.side === side} disabled={side !== "unspecified" && target.reps.length > 115} data-form-change onClick={() => update(item.id, { target: exerciseTarget(target.side === side ? "unspecified" : side, target.reps) })}>{side === "single" ? t("Single", "单侧") : t("Both", "双侧")}</button>)}</div></div></div>
      {recording && item.sets !== null && <label className="field"><span>{t("Completed sets", "实际完成组数")}</span><input type="number" inputMode="numeric" min={0} max={item.sets} value={item.completedSets} onChange={event => update(item.id, { completedSets: Number(event.target.value) })} /></label>}
      </div>; return <fieldset className={recording ? "training-exercise training-exercise-recording" : "training-exercise"} key={item.id}>
      <legend className="sr-only">{t("Exercise", "动作")} {index + 1}</legend>
      {recording ? <Disclosure className="training-record-adjust" defaultOpen={!item.name} title={item.name || t("New exercise", "新动作")} description={[item.sets ? `${item.sets} ${t("sets", "组")}` : "", item.target].filter(Boolean).join(" × ") || t("No target set", "未设置目标")}
        leading={<label className="training-record-toggle"><input type="checkbox" checked={item.completed} aria-label={t(`Complete ${item.name || `exercise ${index + 1}`}`, `完成${item.name || `动作 ${index + 1}`}`)} onChange={event => update(item.id, { completed: event.target.checked, completedSets: event.target.checked ? item.sets ?? 0 : 0 })} /></label>}
        trailing={<output>{item.sets === null ? item.completed ? t("Done", "已完成") : t("Not marked", "未标记") : `${item.completedSets} / ${item.sets}`}</output>}>
        {fields}
      </Disclosure> : fields}
    </fieldset>; })}</div>}</Fragment>)}
    <div className="training-exercise-add-actions">{(["warmup", "training"] as const).map(phase => <button type="button" key={phase} className="text-button training-plan-add-link" disabled={items.length >= 30} data-form-change onClick={() => onChange([...items, { id: crypto.randomUUID(), name: "", phase, sets: null, target: "", completedSets: 0, completed: false }])}><Icon name="plus" />{phase === "warmup" ? t("Add warm-up", "添加热身动作") : t("Add training exercise", "添加训练动作")}</button>)}</div>
  </section>;
}
