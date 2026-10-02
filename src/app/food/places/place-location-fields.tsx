"use client";

import { useEffect, useId, useState } from "react";
import { buildHistorySuggestions } from "@/lib/history-suggestions";
import type { FoodPlace } from "@/lib/types";

type SuggestionValues = Pick<FoodPlace, "city" | "location" | "category">;

export function PlaceSuggestionFields({ values, onChange }: {
  values: SuggestionValues;
  onChange: (patch: Partial<SuggestionValues>) => void;
}) {
  const id = useId();
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    // ponytail: reuse the existing 200-place list; add a dedicated query if the library outgrows it.
    void fetch("/api/food/places?limit=200", { signal: controller.signal })
      .then(async response => { if (response.ok) setPlaces(await response.json()); })
      .catch(() => { /* Suggestions are optional; free input remains available. */ });
    return () => controller.abort();
  }, []);
  const cities = buildHistorySuggestions(places, place => place.city, place => place.updatedAt, 6);
  const locations = buildHistorySuggestions(places, place => place.location, place => place.updatedAt, 6);
  const categories = [...new Set([...buildHistorySuggestions(places, place => place.category, place => place.updatedAt, 6), "米线", "川菜", "咖啡", "甜品", "快餐"])].slice(0, 6);

  return <>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-city`}>城市（可选）</label></span><input id={`${id}-city`} maxLength={100} value={values.city} onChange={event => onChange({ city: event.target.value })} placeholder="例如：成都" />
      {cities.length > 0 && <div className="relation-label-suggestions" role="group" aria-label="城市填写推荐">{cities.map(value => <button type="button" className="user-content" key={value} onClick={() => onChange({ city: value })}>{value}</button>)}</div>}
    </div>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-location`}>地点（可选）</label></span><input id={`${id}-location`} maxLength={200} value={values.location} onChange={event => onChange({ location: event.target.value })} placeholder="商圈、街道或具体地址" />
      {locations.length > 0 && <div className="relation-label-suggestions" role="group" aria-label="地点填写推荐">{locations.map(value => <button type="button" className="user-content" key={value} onClick={() => onChange({ location: value })}>{value}</button>)}</div>}
    </div>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-category`}>品类</label></span><input id={`${id}-category`} maxLength={100} value={values.category} onChange={event => onChange({ category: event.target.value })} placeholder="自由输入" />
      <div className="relation-label-suggestions" role="group" aria-label="品类填写推荐">{categories.map(value => <button type="button" className="user-content" key={value} onClick={() => onChange({ category: value })}>{value}</button>)}</div>
    </div>
  </>;
}
