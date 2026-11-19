"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useBusinessRequest } from "@/components/business-request-context";
import { useFoodData } from "@/components/food-data-context";
import { useFormPreview, FormPreviewNotice } from "@/components/form-preview";
import { Disclosure } from "@/components/disclosure";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { SearchableSelect } from "@/components/searchable-select";
import { showActionToast } from "@/components/action-toast";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { DrinkRecordCard as SharedDrinkRecordCard } from "@/components/drink-record-card";
import { FormSheet } from "@/components/form-sheet";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import { calculateDrinkKcal, foodNutritionReference } from "@/lib/food-calculation";
import { drinkRecordName, drinkTypeLabels } from "@/lib/drink-display";
import { DRINK_TYPE_OPTIONS } from "@/lib/drink-types";
import { temperatureLabels, tasteLabels } from "@/lib/drink-record-labels";
import { translateUiCopy } from "@/lib/ui-copy";
import { DRINK_TEMPERATURES, SUGAR_LEVELS, TASTE_RATINGS } from "@/lib/types";
import type { FoodCatalogItem } from "@/lib/food-catalog";
import type { ApiError, DrinkKcalMode, DrinkLog, DrinkTemperature, DrinkType, FoodNutritionReference, FoodPlace, SugarLevel, TasteRating } from "@/lib/types";
import { FoodNameInput } from "../food/food-name-input";
import { FoodLinkPicker } from "../food/food-link-picker";
import { FoodDeleteAction } from "../food/food-delete-action";
import styles from "./drink-record-editor.module.css";

export { DRINK_TYPE_OPTIONS as drinkTypes } from "@/lib/drink-types";
export { temperatureLabels, tasteLabels } from "@/lib/drink-record-labels";

function draftFromRecord(record?: DrinkLog, initialDate?: string) {
  const sugar = record?.sugarLevel === "五分糖" ? "半糖" : record?.sugarLevel;
  const hasSavedEstimate = record?.estimatedKcal != null || record?.kcalMin != null || record?.kcalMax != null;
  return {
    occurredAt: record ? compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime) : initialDate ?? currentLocalDate(),
    name: record?.name ?? "",
    customName: record?.customName ?? "",
    drinkType: record?.drinkType ?? "other" as DrinkType,
    consumedVolumeMl: record?.consumedVolumeMl?.toString() ?? "",
    foodPlaceId: record?.foodPlaceId?.toString() ?? "",
    drinkMenuId: record?.drinkMenuId?.toString() ?? "",
    foodLibraryId: record?.foodLibraryId?.toString() ?? "",
    sugarLevel: SUGAR_LEVELS.find(level => level === sugar) ?? "" as SugarLevel,
    temperature: record?.temperature ?? "" as DrinkTemperature | "",
    rating: record?.rating ?? "" as TasteRating | "",
    manualKcal: record?.estimatedKcal?.toString() ?? "",
    kcalMode: record?.drinkKcalMode ?? (hasSavedEstimate ? "manual" : "auto") as DrinkKcalMode,
    kcalMin: record?.kcalMin ?? null,
    kcalMax: record?.kcalMax ?? null,
    confidence: record?.confidence ?? "medium",
    notes: record?.notes ?? "",
  };
}

export function DrinkRecordEditor({ record, initialDate, onClose, onSaved, onDeleted }: {
  record?: DrinkLog; initialDate?: string; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted?: () => Promise<void> | void;
}) {
  const businessFetch = useBusinessRequest();
  const { read, local } = useFoodData();
  const previewOnly = useFormPreview();
  const { language } = useLocale();
  const t = (value: string) => translateUiCopy(value, language);
  const [draft, setDraft] = useState(() => draftFromRecord(record, initialDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState<FoodNutritionReference | null>(record?.nutritionReference ?? null);
  const [chosen, setChosen] = useState<FoodCatalogItem>();
  const [replacing, setReplacing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPlaceId, setFilterPlaceId] = useState("");
  const [editingCalories, setEditingCalories] = useState(false);
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [placeAttempt, setPlaceAttempt] = useState(0);
  const linked = Boolean(draft.foodLibraryId || draft.drinkMenuId);
  const searchPlaceId = linked ? filterPlaceId : draft.foodPlaceId;

  useEffect(() => {
    if ((previewOnly && !local) || !draft.foodLibraryId || reference) return;
    const controller = new AbortController();
    void read(`/api/food/library/${draft.foodLibraryId}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const item = await response.json();
        if (!controller.signal.aborted) setReference(foodNutritionReference(item));
      }).catch(() => {});
    return () => controller.abort();
  }, [draft.foodLibraryId, reference, previewOnly, read, local]);

  useEffect(() => {
    if (!filterOpen || (previewOnly && !local)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPlaceLoading(true);
      setPlaceError("");
      void read(`/api/food/places?purpose=drink&limit=200&q=${encodeURIComponent(placeQuery)}`, { signal: controller.signal })
        .then(response => {
          if (!response.ok) throw new Error("店铺加载失败，请重试");
          return response.json() as Promise<FoodPlace[]>;
        }).then(items => {
          if (!controller.signal.aborted) setPlaces(current => [...new Map([...current, ...items].map(item => [item.id, item])).values()]);
        }).catch(reason => {
          if (!controller.signal.aborted) setPlaceError(reason.message);
        }).finally(() => {
          if (!controller.signal.aborted) setPlaceLoading(false);
        });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filterOpen, placeQuery, placeAttempt, previewOnly, read, local]);

  const placeOptions = [...new Map([
    ...(record?.foodPlaceId && record.foodPlaceName ? [{ id: record.foodPlaceId, name: [record.foodPlaceName, record.foodPlaceBranch].filter(Boolean).join(" · ") }] : []),
    ...(chosen?.placeId ? [{ id: chosen.placeId, name: chosen.placeName }] : []),
    ...places.map(place => ({ id: place.id, name: [place.name, place.branch].filter(Boolean).join(" · "), detail: place.city })),
  ].map(place => [place.id, place])).values()];
  const sourceLabel = placeOptions.find(place => String(place.id) === draft.foodPlaceId)?.name
    ?? (linked ? chosen?.placeName || t(draft.drinkMenuId ? "店铺菜单" : "食品库") : "");
  const filterLabel = placeOptions.find(place => String(place.id) === searchPlaceId)?.name;
  const canonicalName = chosen?.name ?? (draft.drinkMenuId ? record?.drinkMenuName : undefined) ?? draft.name;
  const sourceType = chosen?.menu?.drinkType ?? chosen?.library?.drinkType;
  const amount = draft.consumedVolumeMl === "" ? null : Number(draft.consumedVolumeMl);
  const servingKcal = calculateDrinkKcal(reference, null, "serving");
  const estimatedKcal = draft.kcalMode === "manual" ? (draft.manualKcal === "" ? null : Number(draft.manualKcal))
    : calculateDrinkKcal(reference, amount, draft.kcalMode);
  const formatNumber = (value: number) => value.toLocaleString(language, { maximumFractionDigits: 2 });
  const range = draft.kcalMin != null && draft.kcalMax != null ? `${formatNumber(draft.kcalMin)}–${formatNumber(draft.kcalMax)}`
    : draft.kcalMin != null ? formatNumber(draft.kcalMin) : draft.kcalMax != null ? formatNumber(draft.kcalMax) : null;
  const calorieSummary = estimatedKcal != null ? `${formatNumber(estimatedKcal)} kcal`
    : draft.kcalMode === "manual" && range ? `${range} kcal` : t("尚未估算热量");
  const calorieBasis = draft.kcalMode === "manual" && (estimatedKcal != null || range) ? t("手动估算值")
    : draft.kcalMode === "serving" && estimatedKcal != null ? t("按整份计入")
      : estimatedKcal != null && amount != null ? (language === "en" ? `From ${formatNumber(amount)} ml` : `按 ${formatNumber(amount)} ml 换算`) : "";
  const canCountServing = amount === null && servingKcal !== null && draft.kcalMode !== "serving";

  function finishChoosing() {
    setReplacing(false);
    setRenaming(false);
    setBrowseQuery("");
    setFilterOpen(false);
    setFilterPlaceId("");
  }

  function selectItem(item: FoodCatalogItem) {
    const drinkMenuId = item.menu?.id.toString() ?? "";
    const foodLibraryId = item.library?.id.toString() ?? "";
    if (linked && drinkMenuId === draft.drinkMenuId && foodLibraryId === draft.foodLibraryId) {
      finishChoosing();
      return;
    }
    setChosen(item);
    setReference(item.library ? foodNutritionReference(item.library) : null);
    setDraft(current => ({
      ...current, name: item.name, customName: "", foodPlaceId: item.placeId?.toString() ?? "",
      drinkMenuId, foodLibraryId, drinkType: item.menu?.drinkType ?? item.library?.drinkType ?? current.drinkType,
      ...(linked ? { kcalMode: "auto", manualKcal: "", kcalMin: null, kcalMax: null } : {}),
    }));
    finishChoosing();
  }

  function recordName(name: string) {
    if (linked) {
      setChosen(undefined);
      setReference(null);
      setDraft(current => ({
        ...current, name, customName: "", foodPlaceId: searchPlaceId, drinkMenuId: "", foodLibraryId: "",
        kcalMode: "auto", manualKcal: "", kcalMin: null, kcalMax: null,
      }));
      finishChoosing();
    } else {
      setDraft(current => ({ ...current, name }));
    }
  }

  function changeVolume(value: string) {
    setDraft(current => ({
      ...current, consumedVolumeMl: value,
      ...(value !== "" && current.kcalMode === "serving" ? { kcalMode: "auto" } : {}),
    }));
  }

  function setCalculatedMode(mode: "auto" | "serving") {
    setDraft(current => ({ ...current, kcalMode: mode, kcalMin: null, kcalMax: null }));
    setEditingCalories(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (previewOnly || saving) return;
    setSaving(true);
    setError("");
    try {
      const occurred = compactDateTimePayload(draft.occurredAt);
      const timeUnchanged = record && draft.occurredAt === compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime);
      const { manualKcal, kcalMode, ...fields } = draft;
      const body = {
        ...fields, name: draft.name.trim(), customName: draft.customName.trim() || null,
        occurredAt: timeUnchanged ? record.occurredAt : occurred.value,
        occurredHasExplicitTime: timeUnchanged ? record.occurredHasExplicitTime : occurred.hasExplicitTime,
        consumedVolumeMl: amount, temperature: draft.temperature || null, rating: draft.rating || null,
        foodPlaceId: draft.foodPlaceId ? Number(draft.foodPlaceId) : null,
        drinkMenuId: draft.drinkMenuId ? Number(draft.drinkMenuId) : null,
        foodLibraryId: draft.foodLibraryId ? Number(draft.foodLibraryId) : null,
        drinkKcalMode: kcalMode, estimatedKcal: kcalMode === "manual" && manualKcal !== "" ? Number(manualKcal) : null,
      };
      const response = await businessFetch(record ? `/api/drinks/logs/${record.id}` : "/api/drinks/logs", {
        method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as ApiError | null;
        setError(result?.error || `无法保存饮品记录（${response.status}）`);
        return;
      }
      invalidateCachedJson("/api/drinks/suggestions");
      await onSaved();
      showActionToast("饮品记录已保存");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法保存饮品记录");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (previewOnly || !record || !onDeleted || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await businessFetch(`/api/drinks/logs/${record.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("无法删除饮品记录，请重试");
      invalidateCachedJson("/api/drinks/suggestions");
      await onDeleted();
      showActionToast("饮品记录已删除", "deleted");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return <FormSheet title={record ? "改饮品记录" : "补一杯"} onClose={onClose} formId="drink-record-form" submitLabel={record ? "改好了" : "记下"} submitDisabled={previewOnly} busy={saving} busyLabel={record ? "正在修改…" : "正在保存…"}>
    <form id="drink-record-form" className={`editor-card compact-editor field-focus-surface ${styles.editor}`} onSubmit={submit}>
      {previewOnly && <FormPreviewNotice/>}
      <DateTimeField label="日期" value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.slice(11, 16) }}
        onChange={value => setDraft(current => ({ ...current, occurredAt: value.date + (value.time ? `T${value.time}` : "") }))}/>
      <div className={styles.identity}>
        {linked && <div className={styles.selected}>
          <div>
            <span className={styles.label}>{t("喝了什么")}</span>
            <strong className="user-content">{draft.customName.trim() || canonicalName || t("饮品")}</strong>
            <small className="user-content">{[sourceLabel, sourceType ? t(drinkTypeLabels[sourceType]) : ""].filter(Boolean).join(" · ")}</small>
          </div>
          <div className={styles.actions}>
            <button type="button" className="text-button" aria-expanded={renaming} onClick={() => { finishChoosing(); setRenaming(!renaming); }}>{t(renaming ? "完成" : "改名")}</button>
            <button type="button" className="text-button" aria-expanded={replacing} onClick={() => {
              if (replacing) finishChoosing();
              else { setReplacing(true); setRenaming(false); }
            }}>{t(replacing ? "取消更换" : "更换饮品")}</button>
          </div>
        </div>}
        {renaming && <label className="field"><span>{t("记录名称")}</span>
          <input className="user-content" autoFocus maxLength={200} value={draft.customName || ""} placeholder={canonicalName} onChange={event => setDraft(current => ({ ...current, customName: event.target.value }))}/>
        </label>}
        {(!linked || replacing) && <>
          <FoodNameInput key={searchPlaceId} kind="drink" label={replacing ? "搜索并更换饮品" : "喝了什么"} placeId={searchPlaceId || undefined}
            value={linked ? browseQuery : draft.name} onSelect={selectItem} onRecord={recordName}
            onValueChange={linked ? setBrowseQuery : name => setDraft(current => ({ ...current, name }))}/>
          <button type="button" className={`text-button ${styles.filter} user-content`} aria-expanded={filterOpen}
            onClick={() => setFilterOpen(!filterOpen)}>{filterLabel ? `${t("店铺")} · ${filterLabel}` : t("按店铺查找")}</button>
          {filterOpen && <FoodLinkPicker label={linked ? "店铺筛选" : "店铺（可选）"} options={placeOptions}
            selected={searchPlaceId ? [Number(searchPlaceId)] : []} loading={placeLoading} error={placeError}
            onRetry={() => setPlaceAttempt(value => value + 1)} onSearch={setPlaceQuery} onChange={ids => {
              const id = ids[0]?.toString() ?? "";
              if (linked) setFilterPlaceId(id);
              else setDraft(current => ({ ...current, foodPlaceId: id }));
              setFilterOpen(false);
            }}/>}
        </>}
      </div>

      <div className={styles.intake}>
        <div className={styles.intakeMain}>
          <div className="field">
            <label htmlFor="drink-consumed-volume" className={styles.label}>{t("实际饮用量")}</label>
            <div className={styles.volume}>
              <input id="drink-consumed-volume" type="number" inputMode="decimal" min="0" max="10000" step="0.01"
                placeholder="—" value={draft.consumedVolumeMl} onChange={event => changeVolume(event.target.value)}/>
              <span>{t("毫升")}</span>
            </div>
          </div>
          <output className={styles.calorieSummary} aria-live="polite">
            <strong>{calorieSummary}</strong>
            {calorieBasis && <small>{calorieBasis}</small>}
          </output>
        </div>
        {canCountServing && <div className={styles.intakeAction}>
          <span>{t("整份参考")} {formatNumber(servingKcal)} kcal</span>
          <button type="button" className="text-button" data-form-change onClick={() => setCalculatedMode("serving")}>{t("按一整份计入")}</button>
        </div>}
        <div className={styles.intakeAction}>
          <button type="button" className="text-button" aria-expanded={editingCalories}
            onClick={() => setEditingCalories(!editingCalories)}>{t(editingCalories ? "收起" : draft.kcalMode === "manual" ? "修改热量" : "手动估算")}</button>
          {draft.kcalMode !== "auto" && <button type="button" className="text-button" data-form-change onClick={() => setCalculatedMode("auto")}>{t("恢复自动计算")}</button>}
        </div>
        {editingCalories && <label className={`field ${styles.manualEnergy}`}><span>{t("热量估算 kcal")}</span>
          <input type="number" inputMode="decimal" min="0" step="any" autoFocus
            value={draft.kcalMode === "manual" ? draft.manualKcal : estimatedKcal ?? ""}
            onChange={event => { const manualKcal = event.target.value; setDraft(current => ({ ...current, kcalMode: "manual", manualKcal, kcalMin: null, kcalMax: null })); }}/>
        </label>}
      </div>

      {!sourceType && <div className="field"><span>类型</span><SearchableSelect label="类型" searchable={false} value={draft.drinkType}
        onValueChange={value => setDraft(current => ({ ...current, drinkType: value as DrinkType }))}
        options={[...(draft.drinkType === "water" ? [{ value: "water", label: "水（历史分类）" }] : []), ...DRINK_TYPE_OPTIONS.map(([value, label]) => ({ value, label }))]}/></div>}

      <Disclosure title={t("口味、评价与备注")} defaultOpen={Boolean(record?.sugarLevel || record?.temperature || record?.rating || record?.notes)}>
        <div className={styles.details}>
          <div className="field"><span>冷热 / 冰量</span><SearchableSelect label="冷热 / 冰量" searchable={false} clearable value={draft.temperature} onValueChange={value => setDraft(current => ({ ...current, temperature: value as DrinkTemperature | "" }))} options={[{ value: "", label: "未填写" }, ...DRINK_TEMPERATURES.map(value => ({ value, label: temperatureLabels[value] }))]}/></div>
          <div className="field"><span>糖度</span><SearchableSelect label="糖度" searchable={false} clearable presentation="capsules" value={draft.sugarLevel} onValueChange={value => setDraft(current => ({ ...current, sugarLevel: value as SugarLevel }))} options={[{ value: "", label: "未填写" }, ...SUGAR_LEVELS.map(value => ({ value, label: value }))]}/></div>
          <div className="field"><span>评价</span><SearchableSelect label="评价" searchable={false} clearable value={draft.rating} onValueChange={value => setDraft(current => ({ ...current, rating: value as TasteRating | "" }))} options={[{ value: "", label: "未评价" }, ...TASTE_RATINGS.map(value => ({ value, label: tasteLabels[value] }))]}/></div>
          <label className="field"><span>备注（可选）</span><textarea rows={2} maxLength={4000} value={draft.notes} onChange={event => { const notes = event.target.value; setDraft(current => ({ ...current, notes })); }}/></label>
        </div>
      </Disclosure>

      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      {!previewOnly && record && onDeleted && <FoodDeleteAction label="删除这条饮品记录" description={`确定删除「${drinkRecordName(record)}」？删除后无法恢复。`} onDelete={remove} disabled={saving}/>}
    </form>
  </FormSheet>;
}

export function DrinkRecordCard(props: { log: DrinkLog; onEdit: (log: DrinkLog) => void; showDate?: boolean }) {
  return <SharedDrinkRecordCard {...props} LinkComponent={Link}/>;
}
