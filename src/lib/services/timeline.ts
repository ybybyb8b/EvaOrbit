import "server-only";
import { cache } from "react";

import { calculateDailyNutrition } from "../nutrition";
import { buildCalendarTimelineEvents, readCalendarTimelineRecords } from "../calendar-timeline";
import { getRepository } from "../repositories";
import { buildRelationTimelineEvents, buildSubscriptionTimelineEvents, buildTimelineEvents, buildTrainingTimelineEvents, compareTimelineEvents, groupMealTimelineEvents, periodRangesForCalendar, summarizeTimelineDays, timelineEventDate } from "../timeline";
import { dateInEvaOrbit, dateRange } from "../time";
import { catTimeline } from "./cats";
import { catchUpAutomaticSubscriptionPayments } from "./subscription";
import type { TimelineEvent, TimelineMonthSummary } from "../types";
import { combineMealTimeline, resolveMealTimes } from "../meal-calendar";
import { readTimelineAssociations } from "./timeline-association";
import { projectTimelineAssociations } from "../timeline-association";

// Daily and monthly Home views share this read only within one server render.
const requestCatTimeline = cache(catTimeline);
const requestRelationPeople = cache((repository: Awaited<ReturnType<typeof getRepository>>) => repository.listRelationPeople({ includeArchived: true }));

function catsInRange(items:Awaited<ReturnType<typeof catTimeline>>,range:{from:string;to:string}):TimelineEvent[]{return items.filter(item=>item.occurredAt>=range.from&&item.occurredAt<range.to).map(item=>({id:`cat:${item.kind}:${item.id}`,eventType:`cat.${item.eventType}`,sourceType:"cat",sourceId:item.id,title:item.title,detail:item.summary,occurredAt:item.occurredAt,hasExplicitTime:item.occurredHasExplicitTime,endAt:null,href:item.petId?`/cats/${item.petId}`:"/cats",relatedPeople:[],relatedPets:item.petId?[item.petId]:[],metadata:{kind:item.kind,...item.metadata}}));}

function monthDateRange(month: string) {
  const first = `${month}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from: dateRange(first).from, to: dateRange(next.toISOString().slice(0, 10)).from };
}

async function calendarRecordsInRange(range: { from: string; to: string }) {
  const repository = await getRepository();
  return readCalendarTimelineRecords(range, query => repository.listCalendarEvents(query));
}

const subscriptionSources = cache(async (repository: Awaited<ReturnType<typeof getRepository>>) => {
  const subscriptions = await repository.listSubscriptions();
  const subscriptionPayments = (await Promise.all(subscriptions.map(item => repository.listSubscriptionPayments(item.id)))).flat();
  return { subscriptions, subscriptionPayments };
});

async function loadSources(range: { from: string; to: string }, readOnly = false) {
  if (!readOnly) await catchUpAutomaticSubscriptionPayments();
  const repository = await getRepository();
  const [foods, drinks, trackerEntries, trackers, healthRecords, relationEvents, relationPeople, trainingLogs, weightRecords, menstrualFlows, medicationDoses, calendarEvents, subscriptionData, settings] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listRelationEvents({ from: range.from, to: range.to, limit: 100 }),
    requestRelationPeople(repository),
    repository.listTrainingLogs({ from: range.from, to: range.to, limit: 100 }),
    repository.listWeightRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listMenstrualFlowRecords({from:range.from,to:range.to,limit:100}),
    repository.listMedicationDoseEvents({from:range.from,to:range.to,limit:100}),
    calendarRecordsInRange(range),
    subscriptionSources(repository),
    repository.getCalendarInterpretation(),
  ]);
  const associations = await readTimelineAssociations(repository, range, trackers, settings);
  const { subscriptions } = subscriptionData;
  const subscriptionPayments = subscriptionData.subscriptionPayments.filter(item=>`${item.paidOn}T12:00:00.000Z`>=range.from&&`${item.paidOn}T12:00:00.000Z`<range.to);
  return { repository, foods: resolveMealTimes(foods, calendarEvents, settings), drinks, trackerEntries, trackers, healthRecords, relationEvents, relationPeople, trainingLogs, weightRecords, menstrualFlows, medicationDoses, calendarEvents, subscriptions, subscriptionPayments, associations };
}

function mergeTimelineSources(sources: Awaited<ReturnType<typeof loadSources>>, cats: Awaited<ReturnType<typeof catTimeline>>, range: { from: string; to: string }) {
  return projectTimelineAssociations(combineMealTimeline([
    ...buildTimelineEvents(sources.foods, sources.drinks, sources.trackerEntries, sources.trackers, sources.healthRecords, sources.weightRecords, sources.menstrualFlows, sources.medicationDoses),
    ...buildTrainingTimelineEvents(sources.trainingLogs),
    ...buildRelationTimelineEvents(sources.relationEvents,sources.relationPeople),
    ...buildSubscriptionTimelineEvents(sources.subscriptionPayments,sources.subscriptions),
    ...catsInRange(cats, range),
    ...buildCalendarTimelineEvents(sources.calendarEvents, range),
  ]), sources.associations, range).sort(compareTimelineEvents);
}

function groupMealsByDay(events: TimelineEvent[]) {
  const byDay = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const day = timelineEventDate(event);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  return [...byDay.values()].flatMap(groupMealTimelineEvents).sort(compareTimelineEvents);
}

export async function listTimeline(input: { date?: string; limit?: number } = {}) {
  const date = input.date ?? dateInEvaOrbit();
  const range = dateRange(date);
  const [sources, cats] = await Promise.all([loadSources(range), requestCatTimeline()]);
  return mergeTimelineSources(sources, cats, range).slice(0, Math.max(1, Math.min(input.limit ?? 100, 100)));
}

export async function getDailyTimelineOverview(date = dateInEvaOrbit(), options: { readOnly?: boolean } = {}) {
  if (!options.readOnly) await catchUpAutomaticSubscriptionPayments();
  const repository = await getRepository();
  const range = dateRange(date);
  const [foods, drinks, trackerEntries, trackers, nutritionSettings, cats, healthRecords, relationEvents, relationPeople, trainingLogs, weightRecords, menstrualFlows, medicationDoses, subscriptionData, calendarEvents, settings] = await Promise.all([
    repository.listFoodLogs(range),
    repository.listDrinkLogs(range),
    repository.listTrackerEntries(undefined, range),
    repository.listTrackers(),
    repository.getNutritionSettings(date),
    requestCatTimeline(),
    repository.listHealthRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listRelationEvents({ from: range.from, to: range.to, limit: 100 }),
    requestRelationPeople(repository),
    repository.listTrainingLogs({ from: range.from, to: range.to, limit: 100 }),
    repository.listWeightRecords({ from: range.from, to: range.to, limit: 100 }),
    repository.listMenstrualFlowRecords({from:range.from,to:range.to,limit:100}),
    repository.listMedicationDoseEvents({from:range.from,to:range.to,limit:100}),
    subscriptionSources(repository),
    calendarRecordsInRange(range),
    repository.getCalendarInterpretation(),
  ]);
  const { subscriptions } = subscriptionData;
  const subscriptionPayments = subscriptionData.subscriptionPayments.filter(item=>item.paidOn===date);
  const effectiveFoods = resolveMealTimes(foods, calendarEvents, settings);
  const associations = await readTimelineAssociations(repository, range, trackers, settings);
  return {
    date,
    mealEvents: buildTimelineEvents(effectiveFoods, []),
    calendarEvents,
    calendarInterpretation: settings,
    events: projectTimelineAssociations(groupMealTimelineEvents(combineMealTimeline([...buildTimelineEvents(effectiveFoods, drinks, trackerEntries, trackers, healthRecords, weightRecords, menstrualFlows, medicationDoses), ...buildTrainingTimelineEvents(trainingLogs), ...buildRelationTimelineEvents(relationEvents,relationPeople), ...buildSubscriptionTimelineEvents(subscriptionPayments,subscriptions), ...catsInRange(cats,range), ...buildCalendarTimelineEvents(calendarEvents,range)])), associations, range),
    mealTypes: foods.map((item) => item.mealType),
    drinkCount: drinks.length,
    nutrition: calculateDailyNutrition(date, foods, drinks, nutritionSettings),
  };
}

export async function getTimelineMonthSummary(month = dateInEvaOrbit().slice(0, 7), options: { readOnly?: boolean } = {}): Promise<TimelineMonthSummary> {
  const range = monthDateRange(month);
  const repository = await getRepository();
  const periodData = repository.listMenstrualPeriods({ limit: 500 }).then(async menstrualPeriods => {
    const openPeriod = menstrualPeriods.find((item) => item.endedOn === null);
    const calendarFlows = openPeriod ? await repository.listMenstrualFlowRecords({ periodId: openPeriod.id, limit: 500 }) : [];
    return { menstrualPeriods, calendarFlows };
  });
  const [sources, cats, { menstrualPeriods, calendarFlows }] = await Promise.all([loadSources(range, options.readOnly), requestCatTimeline(), periodData]);
  const first = `${month}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const periods = periodRangesForCalendar(menstrualPeriods, calendarFlows).filter((item) => item.startedOn < nextMonth && item.endedOn >= first);
  return { month, days: summarizeTimelineDays(groupMealsByDay(mergeTimelineSources(sources, cats, range))), periods };
}
