import "server-only";

import { calculateDailyNutrition } from "../nutrition";
import { getRepository } from "../repositories";
import { buildRelationTimelineEvents, buildTimelineEvents, buildTrainingTimelineEvents, compareTimelineEvents, groupMealTimelineEvents, summarizeTimelineDays } from "../timeline";
import { dateInEvaOrbit, dateRange } from "../time";
import { catTimeline } from "./cats";
import type { TimelineEvent, TimelineMonthSummary } from "../types";

function catsInRange(items:Awaited<ReturnType<typeof catTimeline>>,range:{from:string;to:string}):TimelineEvent[]{return items.filter(item=>item.occurredAt>=range.from&&item.occurredAt<range.to).map(item=>({id:`cat:${item.kind}:${item.id}`,eventType:`cat.${item.eventType}`,sourceType:"cat",sourceId:item.id,title:item.title,detail:item.summary,occurredAt:item.occurredAt,hasExplicitTime:item.occurredHasExplicitTime,endAt:null,href:item.petId?`/cats/${item.petId}`:"/cats",relatedPeople:[],relatedPets:item.petId?[item.petId]:[],metadata:{kind:item.kind,...item.metadata}}));}

function monthDateRange(month: string) {
  const first = `${month}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from: dateRange(first).from, to: dateRange(next.toISOString().slice(0, 10)).from };
}

async function loadSources(range: { from: string; to: string }) {
  const repository = await getRepository();
  const [foods, drinks, trackerEntries, trackers, healthRecords, relationEvents, trainingLogs] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listRelationEvents({ from: range.from, to: range.to, limit: 100 }),
    repository.listTrainingLogs({ from: range.from, to: range.to, limit: 100 }),
  ]);
  return { repository, foods, drinks, trackerEntries, trackers, healthRecords, relationEvents, trainingLogs };
}

function mergeTimelineSources(sources: Awaited<ReturnType<typeof loadSources>>, cats: Awaited<ReturnType<typeof catTimeline>>, range: { from: string; to: string }) {
  return [
    ...buildTimelineEvents(sources.foods, sources.drinks, sources.trackerEntries, sources.trackers, sources.healthRecords),
    ...buildTrainingTimelineEvents(sources.trainingLogs),
    ...buildRelationTimelineEvents(sources.relationEvents),
    ...catsInRange(cats, range),
  ].sort(compareTimelineEvents);
}

function groupMealsByDay(events: TimelineEvent[]) {
  const byDay = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const day = dateInEvaOrbit(new Date(event.occurredAt));
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  return [...byDay.values()].flatMap(groupMealTimelineEvents).sort(compareTimelineEvents);
}

export async function listTimeline(input: { date?: string; limit?: number } = {}) {
  const date = input.date ?? dateInEvaOrbit();
  const range = dateRange(date);
  const [sources, cats] = await Promise.all([loadSources(range), catTimeline()]);
  return mergeTimelineSources(sources, cats, range).slice(0, Math.max(1, Math.min(input.limit ?? 100, 100)));
}

export async function getDailyTimelineOverview(date = dateInEvaOrbit()) {
  const repository = await getRepository();
  const range = dateRange(date);
  const [foods, drinks, trackerEntries, trackers, nutritionSettings, cats, healthRecords, relationEvents, trainingLogs] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.getNutritionSettings(date),
    catTimeline(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listRelationEvents({ from: range.from, to: range.to, limit: 100 }),
    repository.listTrainingLogs({ from: range.from, to: range.to, limit: 100 }),
  ]);
  return {
    date,
    events: groupMealTimelineEvents([...buildTimelineEvents(foods, drinks, trackerEntries, trackers, healthRecords), ...buildTrainingTimelineEvents(trainingLogs), ...buildRelationTimelineEvents(relationEvents), ...catsInRange(cats,range)]),
    mealTypes: foods.map((item) => item.mealType),
    drinkCount: drinks.length,
    nutrition: calculateDailyNutrition(date, foods, drinks, nutritionSettings),
  };
}

export async function getTimelineMonthSummary(month = dateInEvaOrbit().slice(0, 7)): Promise<TimelineMonthSummary> {
  const range = monthDateRange(month);
  const [sources, cats] = await Promise.all([loadSources(range), catTimeline()]);
  return { month, days: summarizeTimelineDays(groupMealsByDay(mergeTimelineSources(sources, cats, range))) };
}
