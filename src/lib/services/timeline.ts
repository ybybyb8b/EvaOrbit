import "server-only";

import { calculateDailyNutrition } from "../nutrition";
import { getRepository } from "../repositories";
import { buildTimelineEvents } from "../timeline";
import { dateInEvaOrbit, dateRange } from "../time";
import { catTimeline } from "./cats";
import type { TimelineEvent } from "../types";

function catsInRange(items:Awaited<ReturnType<typeof catTimeline>>,range:{from:string;to:string}):TimelineEvent[]{return items.filter(item=>item.occurredAt>=range.from&&item.occurredAt<range.to).map(item=>({id:`cat:${item.kind}:${item.id}`,eventType:`cat.${item.eventType}`,sourceType:"cat",sourceId:item.id,title:item.title,detail:item.summary,occurredAt:item.occurredAt,endAt:null,href:item.petId?`/cats/${item.petId}`:"/cats",relatedPeople:[],relatedPets:item.petId?[item.petId]:[],metadata:{kind:item.kind,...item.metadata}}));}

async function loadDailySources(date: string) {
  const repository = await getRepository();
  const range = dateRange(date);
  const [foods, drinks, trackerEntries, trackers, healthRecords] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
  ]);
  return { repository, foods, drinks, trackerEntries, trackers, healthRecords };
}

export async function listTimeline(input: { date?: string; limit?: number } = {}) {
  const date = input.date ?? dateInEvaOrbit();
  const { foods, drinks, trackerEntries, trackers, healthRecords } = await loadDailySources(date);
  const range=dateRange(date);const cats=catsInRange(await catTimeline(),range);
  return [...buildTimelineEvents(foods, drinks, trackerEntries, trackers, healthRecords), ...cats].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0, Math.max(1, Math.min(input.limit ?? 100, 100)));
}

export async function getDailyTimelineOverview(date = dateInEvaOrbit()) {
  const repository = await getRepository();
  const range = dateRange(date);
  const [foods, drinks, trackerEntries, trackers, nutritionSettings, cats, healthRecords] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.getNutritionSettings(date),
    catTimeline(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
  ]);
  return {
    date,
    events: [...buildTimelineEvents(foods, drinks, trackerEntries, trackers, healthRecords), ...catsInRange(cats,range)].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)),
    mealTypes: foods.map((item) => item.mealType),
    drinkCount: drinks.length,
    nutrition: calculateDailyNutrition(date, foods, drinks, nutritionSettings),
  };
}
