"use client";
import { SearchableSelect } from "@/components/searchable-select";
import { SuggestedInput } from "@/components/suggested-input";

import { useEffect, useId, useState } from "react";
import { buildHistorySuggestions } from "@/lib/history-suggestions";
import { placeServiceLabels, placeKindLabels, placeScopeLabels, defaultPlaceScope } from "@/lib/place-menu";
import type { FoodPlace } from "@/lib/types";

type SuggestionValues = Pick<FoodPlace, "branch" | "city" | "location" | "address" | "category" | "serviceType" | "kind" | "scope">;

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
    <div className="field"><span>来源类型</span><SearchableSelect label="来源类型" searchable={false} value={values.kind??"restaurant"} onValueChange={value=>{const kind=value as FoodPlace["kind"];onChange({kind,scope:values.scope===defaultPlaceScope(values.kind)?defaultPlaceScope(kind):values.scope,serviceType:kind==="drink"?"drink":kind==="restaurant"?"food":"both"});}} options={Object.entries(placeKindLabels).map(([value,label])=>({value,label}))}/></div>
    <div className="field"><span>地点范围</span><SearchableSelect label="地点范围" searchable={false} value={values.scope??"branch"} onValueChange={value=>onChange({scope:value as FoodPlace["scope"]})} options={Object.entries(placeScopeLabels).map(([value,label])=>({value,label}))}/></div>
    <div className="field"><span>饮食能力</span><SearchableSelect label="饮食能力" searchable={false} value={values.serviceType??"food"} onValueChange={(value) =>onChange({serviceType:value as FoodPlace["serviceType"]})} options={[...Object.entries(placeServiceLabels).map(([value,label])=>({value:value,label:label}))]}/></div>
    {(values.scope??"branch") === "branch" && <><label className="field"><span>分店 / 门店</span><input maxLength={160} value={values.branch} onChange={event=>onChange({branch:event.target.value})} placeholder="例如：天府和悦店"/></label><div className="field food-place-location-field"><span><label htmlFor={`${id}-city`}>城市（可选）</label></span><SuggestedInput recommendationStyle="chips" suggestionLabel="城市" suggestions={cities} id={`${id}-city`} maxLength={100} value={values.city} onValueChange={nextValue => onChange({ city: nextValue })} placeholder="例如：成都" />

    </div>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-location`}>区域（可选）</label></span><SuggestedInput recommendationStyle="chips" suggestionLabel="区域" suggestions={locations} id={`${id}-location`} maxLength={200} value={values.location} onValueChange={nextValue => onChange({ location: nextValue })} placeholder="商圈或区域" />

    </div><label className="field wide"><span>地址（可选）</span><input maxLength={500} value={values.address??""} onChange={event=>onChange({address:event.target.value})} placeholder="街道、楼层或完整地址"/></label></>}
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-category`}>品类</label></span><SuggestedInput recommendationStyle="chips" suggestionLabel="品类" suggestions={categories} id={`${id}-category`} maxLength={100} value={values.category} onValueChange={nextValue => onChange({ category: nextValue })} placeholder="自由输入" />

    </div>
  </>;
}
