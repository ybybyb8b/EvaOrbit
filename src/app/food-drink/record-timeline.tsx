"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { foodDrinkTimeline } from "@/lib/food-drink-timeline";
import { foodRecordDisplay } from "@/lib/food-record-display";
import { drinkRecordName } from "@/lib/drink-display";
import { dateInEvaOrbit, EVAORBIT_TIME_ZONE } from "@/lib/time";
import type { FoodLog, DrinkLog } from "@/lib/types";
import { meals, scenes } from "../food/food-record-editor";
import { temperatureLabels } from "../drinks/drink-ui";
import styles from "./food-drink.module.css";

export function RecordTimeline({ foods, drinks, onFood, onDrink, showDate = false, limit }: {
  foods: FoodLog[]; drinks: DrinkLog[]; onFood: (record: FoodLog) => void; onDrink: (record: DrinkLog) => void; showDate?: boolean; limit?: number;
}) {
  return <div className={styles.timeline}>{foodDrinkTimeline(foods, drinks, showDate).slice(0, limit).map(entry => {
    const { record, kind } = entry;
    const title = kind === "food" ? foodRecordDisplay(entry.record).title : drinkRecordName(entry.record);
    const details = kind === "food"
      ? [meals.find(meal => meal.value === entry.record.mealType)?.label, scenes.find(scene => scene.value === entry.record.scene)?.label, entry.record.portion]
      : [entry.record.brand, entry.record.volumeMl ? `${entry.record.volumeMl} ml` : "", entry.record.sugarLevel, entry.record.caffeineMg !== null ? `咖啡因 ${entry.record.caffeineMg} mg` : "", entry.record.temperature ? temperatureLabels[entry.record.temperature] : ""];
    const kcal = record.kcalMin !== null && record.kcalMax !== null ? `${record.kcalMin}–${record.kcalMax} kcal` : record.estimatedKcal !== null ? `约 ${record.estimatedKcal} kcal` : "未估算热量";
    return <article className={styles.record} key={`${kind}:${record.id}`}>
      <div className={styles.recordTime}>{showDate && <span>{dateInEvaOrbit(new Date(record.occurredAt))}</span>}<time dateTime={record.occurredHasExplicitTime === false ? dateInEvaOrbit(new Date(record.occurredAt)) : record.occurredAt}>{record.occurredHasExplicitTime === false ? "仅日期" : new Date(record.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: EVAORBIT_TIME_ZONE })}</time></div>
      <div className={styles.recordBody}><span className={styles.type}>{kind === "food" ? "Food" : "Drink"}</span><h3 className="user-content">{title}</h3><p>{details.filter(Boolean).join(" · ")}</p>{record.foodPlaceName && record.foodPlaceId && <Link className={styles.place} href={`/food/places/${record.foodPlaceId}`}>{record.foodPlaceName}</Link>}{kind === "food" && foodRecordDisplay(entry.record).dishes.length > 0 && <div className="food-linked-dishes">{foodRecordDisplay(entry.record).dishes.map(dish => <span key={dish.id}>{dish.name}</span>)}</div>}<small>{kcal}</small></div>
      <button className={styles.edit} type="button" aria-label={`编辑 ${title}`} onClick={() => kind === "food" ? onFood(entry.record) : onDrink(entry.record)}><Icon name="edit" /></button>
    </article>;
  })}</div>;
}
