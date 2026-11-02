"use client";
import { useRef, useState } from "react";
import { useHealthData } from "@/components/health-data-context";
import { useFormPreview } from "@/components/form-preview";
import { useServerDataState } from "@/components/use-data-refresh";
import { useLocale } from "@/components/locale-controller";
import type { SuggestionActions } from "@/components/suggested-input";
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
  function actions(kind: TrainingSuggestionKind): SuggestionActions { return { remove: value => { void change(kind, value, true); }, create: value => { if(data.exclusions?.some(item => item.kind === kind && suggestionValue(item.value) === suggestionValue(value))) void change(kind, value, false); }, busy: busy || preview, error }; }
  return { data, actions, excludedExercises };
}
