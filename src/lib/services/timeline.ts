import "server-only";

import { calculateDailyNutrition } from "../nutrition";
import { getRepository } from "../repositories";
import { buildRelationTimelineEvents, buildSubscriptionTimelineEvents, buildTimelineEvents, buildTrainingTimelineEvents, compareTimelineEvents, groupMealTimelineEvents, summarizeTimelineDays } from "../timeline";
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
  const [foods, drinks, trackerEntries, trackers, healthRecords, relationEvents, trainingLogs, weightRecords, menstrualFlows, medicationDoses] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listRelationEvents({ from: range.from, to: range.to, limit: 100 }),
    repository.listTrainingLogs({ from: range.from, to: range.to, limit: 100 }),
    repository.listWeightRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listMenstrualFlowRecords({from:range.from,to:range.to,limit:100}),
    repository.listMedicationDoseEvents({from:range.from,to:range.to,limit:100}),
  ]);
  const subscriptions=await repository.listSubscriptions();
  const subscriptionPayments=(await Promise.all(subscriptions.map(item=>repository.listSubscriptionPayments(item.id)))).flat().filter(item=>`${item.paidOn}T12:00:00.000Z`>=range.from&&`${item.paidOn}T12:00:00.000Z`<range.to);
  return { repository, foods, drinks, trackerEntries, trackers, healthRecords, relationEvents, trainingLogs, weightRecords, menstrualFlows, medicationDoses, subscriptions, subscriptionPayments };
}

function mergeTimelineSources(sources: Awaited<ReturnType<typeof loadSources>>, cats: Awaited<ReturnType<typeof catTimeline>>, range: { from: string; to: string }) {
  return [
    ...buildTimelineEvents(sources.foods, sources.drinks, sources.trackerEntries, sources.trackers, sources.healthRecords, sources.weightRecords, sources.menstrualFlows, sources.medicationDoses),
    ...buildTrainingTimelineEvents(sources.trainingLogs),
    ...buildRelationTimelineEvents(sources.relationEvents),
    ...buildSubscriptionTimelineEvents(sources.subscriptionPayments,sources.subscriptions),
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
  const [foods, drinks, trackerEntries, trackers, nutritionSettings, cats, healthRecords, relationEvents, trainingLogs, weightRecords, menstrualFlows, medicationDoses, subscriptions] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.getNutritionSettings(date),
    catTimeline(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listRelationEvents({ from: range.from, to: range.to, limit: 100 }),
    repository.listTrainingLogs({ from: range.from, to: range.to, limit: 100 }),
    repository.listWeightRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listMenstrualFlowRecords({from:range.from,to:range.to,limit:100}),
    repository.listMedicationDoseEvents({from:range.from,to:range.to,limit:100}),
    repository.listSubscriptions(),
  ]);
  const subscriptionPayments=(await Promise.all(subscriptions.map(item=>repository.listSubscriptionPayments(item.id)))).flat().filter(item=>item.paidOn===date);
  return {
    date,
    events: groupMealTimelineEvents([...buildTimelineEvents(foods, drinks, trackerEntries, trackers, healthRecords, weightRecords, menstrualFlows, medicationDoses), ...buildTrainingTimelineEvents(trainingLogs), ...buildRelationTimelineEvents(relationEvents), ...buildSubscriptionTimelineEvents(subscriptionPayments,subscriptions), ...catsInRange(cats,range)]),
    mealTypes: foods.map((item) => item.mealType),
    drinkCount: drinks.length,
    nutrition: calculateDailyNutrition(date, foods, drinks, nutritionSettings),
  };
}

export async function getTimelineMonthSummary(month = dateInEvaOrbit().slice(0, 7)): Promise<TimelineMonthSummary> {
  const range = monthDateRange(month);
  const [sources, cats] = await Promise.all([loadSources(range), catTimeline()]);
  const first = `${month}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const periods = (await sources.repository.listMenstrualPeriods({ limit: 500 })).filter((item) => item.startedOn < nextMonth && (!item.endedOn || item.endedOn >= first));
  return { month, days: summarizeTimelineDays(groupMealsByDay(mergeTimelineSources(sources, cats, range))), periods };
}
