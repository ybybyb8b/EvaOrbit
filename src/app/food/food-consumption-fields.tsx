"use client";
import { SearchableSelect } from "@/components/searchable-select";
import { calculateFoodKcal, defaultFoodUnit, foodNutritionReference, foodReferenceKcal } from "@/lib/food-calculation";
import type { FoodConsumption, FoodLibraryItem, FoodQuantityUnit } from "@/lib/types";
import { FoodLibraryPicker } from "./food-library-picker";
import styles from "./food-consumption-fields.module.css";

export function consumptionFromItem(item: FoodLibraryItem): FoodConsumption {
  const nutritionReference = foodNutritionReference(item);
  return { foodLibraryId: item.id, item: { id: item.id, name: item.name, brand: item.brand }, quantity: null,
    unit: defaultFoodUnit(nutritionReference), nutritionReference, calculatedKcal: null };
}

export function FoodConsumptionFields({ value, index, onChange, onLoaded, onRemove }: {
  value: FoodConsumption; index: number; onChange: (value: FoodConsumption) => void; onLoaded: (item: FoodLibraryItem) => void; onRemove: () => void;
}) {
  const reference = value.nutritionReference;
  const kcal = reference ? foodReferenceKcal(reference) : null;
  const suffix = reference?.referenceType === "per_100g" ? "100 g" : reference?.referenceType === "per_100ml" ? "100 ml" : "份";
  const name = value.item?.name ?? `食品 ${index + 1}`;
  function change(quantity: number | null, unit: FoodQuantityUnit) {
    onChange({ ...value, quantity, unit, calculatedKcal: reference ? calculateFoodKcal(reference, quantity, unit) : null });
  }
  return <div className={`field wide ${styles.consumption}`}>
    <FoodLibraryPicker label={`Food Library 食品 ${index + 1}`} value={String(value.foodLibraryId)} selectedItem={value.item} onLoaded={onLoaded}
      onChange={(_, item) => item ? onChange(consumptionFromItem(item)) : onRemove()} />
    <p className="muted">{kcal === null ? "暂无可计算的营养基准，可手动填写热量" : `${Number(kcal.toFixed(2))} kcal / ${suffix}`}</p>
    <div className="form-grid">
      <label className="field"><span>本次食用量</span><input aria-label={`${name} 本次食用量`} type="number" inputMode="decimal" min="0" max="1000000" step="any" value={value.quantity ?? ""} placeholder="填写实际食用量" onChange={event => change(event.target.value === "" ? null : Number(event.target.value), value.unit)} /></label>
      <div className="field"><span>单位</span><SearchableSelect label={`${name} 单位`} searchable={false} value={value.unit} onValueChange={unit => change(value.quantity, unit as FoodQuantityUnit)} options={[{ value: "g", label: "g（克）" }, { value: "ml", label: "ml（毫升）" }, { value: "serving", label: "份" }]} /></div>
    </div>
    <div className={styles.result}><output aria-live="polite" aria-label={`${name} 计算热量`}>{value.calculatedKcal != null ? `约 ${Math.round(value.calculatedKcal)} kcal` : value.quantity === null ? "填写食用量后计算" : "当前基准与单位无法换算，可手动估算"}</output><button type="button" className="text-button" data-form-change onClick={onRemove}>移除食品</button></div>
  </div>;
}
