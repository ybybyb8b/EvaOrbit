"use client";
import { useRef, useState } from "react";
import { useHealthData } from "@/components/health-data-context";
import { useFormPreview } from "@/components/form-preview";
import { useServerDataState } from "@/components/use-data-refresh";
import { useLocale } from "@/components/locale-controller";
import { ErrorNotice } from "@/components/error-notice";
import { Icon } from "@/components/icons";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import { suggestionValue } from "@/lib/training-suggestions";
import type { TrainingInputSuggestions, TrainingSuggestionKind } from "@/lib/types";

export function useTrainingSuggestions(initial: TrainingInputSuggestions, onChanged?: (data: TrainingInputSuggestions) => void) {
  const { read } = useHealthData();
  const preview = useFormPreview();
  const { english } = useLocale();
  const [data, setData] = useServerDataState(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  async function change(kind: TrainingSuggestionKind, value: string, hidden: boolean) {
    if (preview || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await read("/api/health/training/suggestions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value, hidden }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update suggestions");
      setData(result); invalidateCachedJson("/api/health/training/suggestions"); onChanged?.(result);
    } catch { setError(english ? "Could not update this option. Try again." : "未能更新此选项，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  }
  const excludedExercises = new Set(data.exclusions?.filter(item => item.kind === "exercise").map(item => suggestionValue(item.value)));
  return { data, busy: busy || preview, error, change, excludedExercises };
}

export function TrainingSuggestionsManager({ controller, exercisesOnly = false, extraExercises = [] }: { controller: ReturnType<typeof useTrainingSuggestions>; exercisesOnly?: boolean; extraExercises?: string[] }) {
  const { english } = useLocale();
  const { data, busy, error, change } = controller;
  const kinds: TrainingSuggestionKind[] = exercisesOnly ? ["exercise"] : ["teacher", "course", "exercise"];
  const label = (kind: TrainingSuggestionKind) => ({ teacher: english ? "Teachers" : "老师", course: english ? "Courses" : "课程", exercise: english ? "Exercises" : "动作" })[kind];
  const values = (kind: TrainingSuggestionKind) => kind === "teacher" ? data.teachers : kind === "course" ? data.courses : [...new Set([...(data.exercises ?? []), ...(data.exercisePresets ?? []).map(item => item.name), ...(data.previousExercises ?? []).map(item => item.name), ...extraExercises].filter(value => value.trim() && !controller.excludedExercises.has(suggestionValue(value))))];
  return <details className="training-suggestions-manager"><summary>{english ? "Manage history options" : "管理历史选项"}</summary>
    <p>{english ? "Removing an option stops future suggestions. Saved workouts stay as they are." : "删除后不再推荐，已保存的训练记录保留。"}</p>
    {error && <ErrorNotice inline>{error}</ErrorNotice>}
    {kinds.map(kind => <section key={kind} aria-label={label(kind)}><h4>{label(kind)}</h4>{values(kind).length ? <ul>{values(kind).map(value => <li key={value}><span>{value}</span><button type="button" className="icon-button subtle" disabled={busy} aria-label={english ? `Remove ${value} from ${kind} options` : `删除${label(kind)}选项「${value}」`} onClick={() => void change(kind, value, true)}><Icon name="trash" /></button></li>)}</ul> : <small>{english ? "No history options" : "暂无历史选项"}</small>}</section>)}
    {(data.exclusions ?? []).some(item => kinds.includes(item.kind)) && <details className="training-suggestions-removed"><summary>{english ? "Removed options · Restore" : "已删除的选项 · 可恢复"}</summary><ul>{data.exclusions!.filter(item => kinds.includes(item.kind)).map(item => <li key={`${item.kind}:${item.value}`}><span><small>{label(item.kind)}</small>{item.value}</span><button type="button" className="text-button" disabled={busy} onClick={() => void change(item.kind, item.value, false)}>{english ? "Restore" : "恢复"}</button></li>)}</ul></details>}
  </details>;
}
