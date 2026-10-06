"use client";
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
    <div className="field wide"><span>来源类型</span><div className="chip-row place-enum-options" role="group" aria-label="来源类型">{Object.entries(placeKindLabels).map(([value,label])=><button type="button" data-form-change key={value} className={(values.kind??"restaurant")===value?"active":""} aria-pressed={(values.kind??"restaurant")===value} onClick={()=>{const kind=value as FoodPlace["kind"];onChange({kind,scope:values.scope===defaultPlaceScope(values.kind)?defaultPlaceScope(kind):values.scope,serviceType:kind==="drink"?"drink":kind==="restaurant"?"food":"both"});}}>{label}</button>)}</div></div>
    <div className="field wide"><span>地点范围</span><div className="chip-row place-enum-options" role="group" aria-label="地点范围">{Object.entries(placeScopeLabels).map(([value,label])=><button type="button" data-form-change key={value} className={(values.scope??"branch")===value?"active":""} aria-pressed={(values.scope??"branch")===value} onClick={()=>onChange({scope:value as FoodPlace["scope"]})}>{label}</button>)}</div></div>
    <div className="field wide"><span>饮食能力</span><div className="chip-row place-enum-options" role="group" aria-label="饮食能力">{Object.entries(placeServiceLabels).map(([value,label])=><button type="button" data-form-change key={value} className={(values.serviceType??"food")===value?"active":""} aria-pressed={(values.serviceType??"food")===value} onClick={()=>onChange({serviceType:value as FoodPlace["serviceType"]})}>{label}</button>)}</div></div>
    {(values.scope??"branch") === "branch" && <><label className="field"><span>分店 / 门店</span><input maxLength={160} value={values.branch} onChange={event=>onChange({branch:event.target.value})} placeholder="例如：天府和悦店"/></label><div className="field food-place-location-field"><span><label htmlFor={`${id}-city`}>城市（可选）</label></span><SuggestedInput recommendationStyle="chips" suggestionLabel="城市" suggestions={cities} id={`${id}-city`} maxLength={100} value={values.city} onValueChange={nextValue => onChange({ city: nextValue })} placeholder="例如：成都" />

    </div>
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-location`}>区域（可选）</label></span><SuggestedInput recommendationStyle="chips" suggestionLabel="区域" suggestions={locations} id={`${id}-location`} maxLength={200} value={values.location} onValueChange={nextValue => onChange({ location: nextValue })} placeholder="商圈或区域" />

    </div><label className="field wide"><span>地址（可选）</span><input maxLength={500} value={values.address??""} onChange={event=>onChange({address:event.target.value})} placeholder="街道、楼层或完整地址"/></label></>}
    <div className="field food-place-location-field"><span><label htmlFor={`${id}-category`}>品类</label></span><SuggestedInput recommendationStyle="chips" suggestionLabel="品类" suggestions={categories} id={`${id}-category`} maxLength={100} value={values.category} onValueChange={nextValue => onChange({ category: nextValue })} placeholder="自由输入" />

    </div>
  </>;
}
