"use client";
import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { calculateFoodKcal, defaultFoodUnit, foodNutritionReference, foodReferenceKcal } from "@/lib/food-calculation";
import type { FoodConsumption, FoodLibraryItem, FoodQuantityUnit } from "@/lib/types";
import { FoodLibraryPicker } from "./food-library-picker";
import styles from "./food-consumption-fields.module.css";

export function consumptionFromItem(item: FoodLibraryItem): FoodConsumption {
  const nutritionReference = foodNutritionReference(item);
  return { foodLibraryId: item.id, item: { id: item.id, name: item.name, brand: item.brand, foodPlaceId:item.foodPlaceId??null }, quantity: null,
    unit: defaultFoodUnit(nutritionReference), nutritionReference, calculatedKcal: null };
}

export function FoodConsumptionFields({ name, source, value, placeId, dish, shared, onChange, onLoaded, onRemove }: {
  name: string; source?: string; value?: FoodConsumption; placeId?: string; dish?: boolean; shared?: boolean;
  onChange: (value: FoodConsumption) => void; onLoaded: (item: FoodLibraryItem) => void; onRemove: () => void;
}) {
  const { english } = useLocale();
  const t = (text: string) => translateUiCopy(text, english ? "en" : "zh-CN");
  const [open, setOpen] = useState(Boolean(value && !value.nutritionReference));
  const [changing, setChanging] = useState(Boolean(value && !value.nutritionReference));
  const detailsId = useId();
  const reference = value?.nutritionReference;
  const kcal = reference ? foodReferenceKcal(reference) : null;
  const suffix = reference?.referenceType === "per_100g" ? "100 g" : reference?.referenceType === "per_100ml" ? "100 ml" : english ? "serving" : "份";
  const primaryUnit = reference ? defaultFoodUnit(reference) : value?.unit;
  const units = new Set([value?.unit, primaryUnit]);
  if (reference?.servingWeight && reference.referenceType !== "per_100ml") units.add(primaryUnit === "g" ? "serving" : "g");
  if (reference?.servingKcal != null) units.add("serving");
  const unitLabel = (unit: FoodQuantityUnit) => unit === "g" ? t("克") : unit === "ml" ? t("毫升") : english ? "srv" : "份";
  function change(quantity: number | null, unit: FoodQuantityUnit) {
    if (value) onChange({ ...value, quantity, unit, calculatedKcal: reference ? calculateFoodKcal(reference, quantity, unit) : null });
  }
  function changeUnit(unit: FoodQuantityUnit) {
    if (!value || unit === value.unit) return;
    const weight = reference?.servingWeight;
    const quantity = value.quantity === null || !weight ? null
      : value.unit === "g" && unit === "serving" ? value.quantity / weight
      : value.unit === "serving" && unit === "g" ? Math.round(value.quantity * weight * 100) / 100
      : null;
    change(quantity, unit);
  }
  const status = shared ? t("共用份量") : !value || kcal === null ? t("缺少营养基准")
    : value.quantity === null ? t("未填份量") : t("无法换算");
  return <li className={styles.row}>
    <div className={styles.identity}>
      {value ? <button type="button" className={styles.name} aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen(!open)}>
        <strong className="user-content">{name}</strong><Icon name="chevronDown"/>
      </button> : <strong className="user-content">{name}</strong>}
      {source && <small className="user-content">{source}</small>}
    </div>
    {value && <div className={`field ${styles.amount}`}>
      <input aria-label={`${name} ${t("本次食用量")}`} type="number" inputMode="decimal" min="0" max="1000000" step={value.unit === "g" ? "0.01" : "any"} value={value.quantity ?? ""} placeholder="—" onChange={event => change(event.target.value === "" ? null : Number(event.target.value), value.unit)} />
      {units.size > 1 ? <select aria-label={`${name} ${t("单位")}`} value={value.unit} onChange={event => changeUnit(event.target.value as FoodQuantityUnit)}>
        {[...units].map(unit => unit && <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
      </select> : <small>{unitLabel(value.unit)}</small>}
    </div>}
    <output className={styles.result} aria-label={`${name} ${t("计算热量")}`} data-calculated={value?.calculatedKcal != null}>
      {value?.calculatedKcal != null ? `${value.calculatedKcal.toLocaleString(english ? "en" : "zh-CN", { maximumFractionDigits: 2 })} kcal` : status}
    </output>
    <button type="button" className={styles.remove} data-form-change aria-label={`${t(dish ? "移除菜品关联" : "移除食品")} ${name}`} onClick={onRemove}><Icon name="close"/></button>
    {value && open && <div className={styles.details} id={detailsId}>
      <p>{kcal === null ? t("暂无营养基准，可留空或手动估算") : `${Number(kcal.toFixed(2))} kcal / ${suffix}`}</p>
      {!dish && <button type="button" className="text-button" aria-expanded={changing} onClick={() => setChanging(!changing)}>{t(changing ? "收起" : "更换食品")}</button>}
      {!dish && changing && <FoodLibraryPicker label={t("更换食品")} placeId={placeId} value={String(value.foodLibraryId)} selectedItem={value.item} onLoaded={onLoaded}
        onChange={(_, item) => { if (item) { if (item.id !== value.foodLibraryId) onChange(consumptionFromItem(item)); setChanging(false); } }} />}
    </div>}
  </li>;
}
