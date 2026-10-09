"use client";
import { SearchableSelect } from "@/components/searchable-select";
import { useState } from "react";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { calculateFoodKcal, defaultFoodUnit, foodNutritionReference, foodReferenceKcal } from "@/lib/food-calculation";
import type { FoodConsumption, FoodLibraryItem, FoodQuantityUnit } from "@/lib/types";
import { FoodLibraryPicker } from "./food-library-picker";
import styles from "./food-consumption-fields.module.css";

export function consumptionFromItem(item: FoodLibraryItem): FoodConsumption {
  const nutritionReference = foodNutritionReference(item);
  return { foodLibraryId: item.id, item: { id: item.id, name: item.name, brand: item.brand }, quantity: null,
    unit: defaultFoodUnit(nutritionReference), nutritionReference, calculatedKcal: null };
}

export function FoodConsumptionFields({ value, index, placeId, hideQuantity = false, onChange, onLoaded, onRemove }: {
  value: FoodConsumption; index: number; placeId?: string; hideQuantity?: boolean; onChange: (value: FoodConsumption) => void; onLoaded: (item: FoodLibraryItem) => void; onRemove: () => void;
}) {
  const { english } = useLocale();
  const t = (text: string) => translateUiCopy(text, english ? "en" : "zh-CN");
  const [changing, setChanging] = useState(!value.nutritionReference);
  const reference = value.nutritionReference;
  const kcal = reference ? foodReferenceKcal(reference) : null;
  const suffix = reference?.referenceType === "per_100g" ? "100 g" : reference?.referenceType === "per_100ml" ? "100 ml" : english ? "serving" : "份";
  const name = value.item?.name ?? `食品 ${index + 1}`;
  const primaryUnit = reference ? defaultFoodUnit(reference) : value.unit;
  const availableUnits = reference && reference.servingWeight !== null && reference.servingWeight > 0 && reference.referenceType !== "per_100ml" ? [primaryUnit, primaryUnit === "g" ? "serving" : "g"] : [primaryUnit];
  const units = [...new Set([...availableUnits, value.unit])];
  function change(quantity: number | null, unit: FoodQuantityUnit) {
    onChange({ ...value, quantity, unit, calculatedKcal: reference ? calculateFoodKcal(reference, quantity, unit) : null });
  }
  return <div className={`field wide ${styles.consumption}`}>
    <div className={styles.heading}><strong className="user-content">{name}</strong><button type="button" className="text-button" onClick={() => setChanging(!changing)} aria-expanded={changing}>{changing ? "收起" : "更换食品"}</button></div>
    {changing && <FoodLibraryPicker label={`更换食品 ${index + 1}`} placeId={placeId} value={String(value.foodLibraryId)} selectedItem={value.item} onLoaded={onLoaded}
      onChange={(_, item) => { if (item) { onChange(consumptionFromItem(item)); setChanging(false); } else onRemove(); }} />}
    <p className="muted">{kcal === null ? "暂无营养基准，可留空或手动估算" : `${Number(kcal.toFixed(2))} kcal / ${suffix}`}</p>
    {!hideQuantity && <div className="form-grid">
      <label className="field"><span>本次食用量</span><input aria-label={`${name} ${english ? "amount consumed" : "本次食用量"}`} type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={value.quantity ?? ""} placeholder={t("填写实际食用量")} onChange={event => change(event.target.value === "" ? null : Number(event.target.value), value.unit)} /></label>
      <div className="field"><span>单位</span>{units.length === 1 ? <span className={styles.unit}>{value.unit === "serving" ? "份" : value.unit === "g" ? "克" : "毫升"}</span> : <SearchableSelect label={`${name} 单位`} searchable={false} value={value.unit} onValueChange={unit => change(value.quantity, unit as FoodQuantityUnit)} options={units.map(unit => ({ value: unit, label: unit === "g" ? "克" : unit === "ml" ? "毫升" : "份" }))} />}</div>
    </div>}
    <div className={styles.result}><output aria-live="polite" aria-label={`${name} ${english ? "calculated calories" : "计算热量"}`}>{value.calculatedKcal != null ? `${english ? "About" : "约"} ${value.calculatedKcal.toFixed(2)} kcal` : t(value.quantity === null ? "填写食用量后计算" : "当前基准与单位无法换算，可手动估算")}</output><button type="button" className="text-button" data-form-change onClick={onRemove}>移除食品</button></div>
  </div>;
}
