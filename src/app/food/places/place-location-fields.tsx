"use client";
import { SuggestedInput } from "@/components/suggested-input";

import { useEffect, useId, useState } from "react";
import { buildHistorySuggestions } from "@/lib/history-suggestions";
import { placeServiceLabels } from "@/lib/place-menu";
import type { FoodPlace } from "@/lib/types";

type SuggestionValues = Pick<FoodPlace, "city" | "location" | "category" | "serviceType">;

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
  const locations = buildHistorySuggestions(places.filter(place => !values.city.trim() || place.city.trim().toLocaleLowerCase() === values.city.trim().toLocaleLowerCase()), place => place.location, place => place.updatedAt, 6);
  const categories = [...new Set([...buildHistorySuggestions(places, place => place.category, place => place.updatedAt, 6), "米线", "川菜", "咖啡", "甜品", "快餐"])].slice(0, 6);

  return <>
    <label className="field"><span>店铺类型</span><select value={values.serviceType??"food"} onChange={event=>onChange({serviceType:event.target.value as FoodPlace["serviceType"]})}>{Object.entries(placeServiceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-city`}>城市（可选）</label></span><SuggestedInput suggestionLabel="城市" suggestions={cities} id={`${id}-city`} maxLength={100} value={values.city} onValueChange={nextValue => onChange({ city: nextValue })} placeholder="例如：成都" />

    </div>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-location`}>地点（可选）</label></span><SuggestedInput suggestionLabel="地点" suggestions={locations} id={`${id}-location`} maxLength={200} value={values.location} onValueChange={nextValue => onChange({ location: nextValue })} placeholder="商圈、街道或具体地址" />

    </div>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-category`}>品类</label></span><SuggestedInput suggestionLabel="品类" suggestions={categories} id={`${id}-category`} maxLength={100} value={values.category} onValueChange={nextValue => onChange({ category: nextValue })} placeholder="自由输入" />

    </div>
  </>;
}
