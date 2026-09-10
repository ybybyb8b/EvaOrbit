import type { DrinkLog, FoodLog, HealthRecord, RelationEvent, TimelineDaySummary, TimelineEvent, TrainingLog, Tracker, TrackerEntry, WeightRecord } from "./types";
import { dateInEvaOrbit } from "./time.ts";
import { formatWeightKg } from "./weight.ts";

export function buildTimelineEvents(foods: FoodLog[], drinks: DrinkLog[], trackerEntries: TrackerEntry[] = [], trackers: Tracker[] = [], healthRecords: HealthRecord[] = [], weightRecords: WeightRecord[] = []): TimelineEvent[] {
  const foodEvents: TimelineEvent[] = foods.map((item) => ({
    id: `food:${item.id}`,
    eventType: "food.logged",
    sourceType: "food",
    sourceId: item.id,
    title: item.title,
    detail: item.portion || item.description || "饮食记录",
    occurredAt: item.occurredAt,
    hasExplicitTime: true,
    endAt: null,
    href: "/food",
    relatedPeople: [],
    relatedPets: [],
    metadata: { mealType: item.mealType, scene: item.scene, rating: item.rating, estimatedKcal: item.estimatedKcal, confidence: item.confidence },
  }));
  const drinkEvents: TimelineEvent[] = drinks.map((item) => ({
    id: `drink:${item.id}`,
    eventType: "drink.logged",
    sourceType: "drink",
    sourceId: item.id,
    title: item.name,
    detail: item.volumeMl ? `${item.volumeMl} ml` : item.brand || "饮品记录",
    occurredAt: item.occurredAt,
    hasExplicitTime: item.occurredHasExplicitTime,
    endAt: null,
    href: "/drinks",
    relatedPeople: [],
    relatedPets: [],
    metadata: { drinkType: item.drinkType, brand: item.brand, volumeMl: item.volumeMl, sugarLevel: item.sugarLevel, temperature: item.temperature, rating: item.rating, estimatedKcal: item.estimatedKcal, confidence: item.confidence },
  }));
  const trackerMap = new Map(trackers.map((tracker) => [tracker.id, tracker]));
  const trackerEvents: TimelineEvent[] = trackerEntries.map((entry) => {
    const tracker = trackerMap.get(entry.trackerId);
    return {
      id: `tracker:${entry.id}`, eventType: "tracker.logged", sourceType: "tracker", sourceId: entry.id,
      title: tracker ? tracker.name : "Tracker record", detail: entry.note || "Recorded a moment",
      occurredAt: entry.occurredAt, hasExplicitTime: true, endAt: entry.endAt, href: `/trackers/${entry.trackerId}`,
      relatedPeople: [], relatedPets: [], metadata: { trackerId: entry.trackerId, values: entry.values },
    };
  });
  const healthEvents: TimelineEvent[] = healthRecords.map((item) => ({
    id: `health:${item.id}`, eventType: `health.${item.type}`, sourceType: "health", sourceId: item.id,
    title: item.title, detail: item.summary || item.type.replaceAll("_", " "),
    occurredAt: item.occurredAt, hasExplicitTime: item.occurredHasExplicitTime, endAt: item.endedAt, href: `/health/records/${item.id}`,
    relatedPeople: [], relatedPets: [], metadata: { type: item.type, status: item.status, details: item.details },
  }));
  const weightEvents: TimelineEvent[] = weightRecords.map((item) => ({
    id:`weight:${item.id}`,eventType:"health.weight",sourceType:"health",sourceId:item.id,title:"Weight",detail:`${formatWeightKg(item.weightKg)} kg · ${item.healthKitSourceName || item.healthKitSourceBundle || (item.source === "apple_health" ? "Apple Health" : "EvaOrbit")}`,
    occurredAt:item.occurredAt,hasExplicitTime:item.occurredHasExplicitTime,endAt:null,href:"/health#weight-title",relatedPeople:[],relatedPets:[],metadata:{weightKg:item.weightKg,source:item.source},
  }));
  return [...foodEvents, ...drinkEvents, ...trackerEvents, ...healthEvents, ...weightEvents].sort(compareTimelineEvents);
}

export function buildTrainingTimelineEvents(logs: TrainingLog[]): TimelineEvent[] {
  const events: TimelineEvent[] = logs.map((item) => ({
    id: `training:${item.id}`,
    eventType: "training.logged",
    sourceType: "training" as const,
    sourceId: item.id,
    title: item.course || "Training",
    detail: [item.bodyParts.join(" · "), item.teacher, item.durationMinutes ? `${item.durationMinutes} min` : ""].filter(Boolean).join(" · "),
    occurredAt: item.occurredAt,
    hasExplicitTime: item.occurredHasExplicitTime,
    endAt: null,
    href: `/health?training=${item.id}`,
    relatedPeople: [],
    relatedPets: [],
    metadata: {
      trainingType: item.trainingType,
      bodyParts: item.bodyParts,
      teacher: item.teacher,
      course: item.course,
      durationMinutes: item.durationMinutes,
    },
  }));
  return events.sort(compareTimelineEvents);
}

export function groupMealTimelineEvents(events: TimelineEvent[]) {
  const mealGroups = new Map<string, TimelineEvent[]>();
  const otherEvents: TimelineEvent[] = [];
  for (const event of events) {
    const mealType = event.sourceType === "food" && typeof event.metadata.mealType === "string" ? event.metadata.mealType : null;
    if (!mealType) { otherEvents.push(event); continue; }
    const group = mealGroups.get(mealType) ?? [];
    group.push(event);
    mealGroups.set(mealType, group);
  }
  const meals = [...mealGroups.entries()].map(([mealType, items]) => {
    const ordered = [...items].sort(compareTimelineEvents);
    const first = ordered[0];
    return {
      ...first,
      id: `food-meal:${mealType}:${dateInEvaOrbit(new Date(first.occurredAt))}`,
      eventType: "food.meal",
      detail: ordered.map((item) => item.title).join(" · "),
      metadata: { ...first.metadata, mealType, foodItems: ordered.map((item) => ({ title: item.title, detail: item.detail })), count: ordered.length },
    } satisfies TimelineEvent;
  });
  return [...otherEvents, ...meals].sort(compareTimelineEvents);
}

export function summarizeTimelineDays(events: TimelineEvent[]) {
  const days: Record<string, TimelineDaySummary> = {};
  for (const event of events) {
    const day = dateInEvaOrbit(new Date(event.occurredAt));
    const current = days[day] ?? { count: 0, highlighted: false };
    days[day] = {
      count: current.count + 1,
      highlighted: current.highlighted || event.sourceType === "training" || event.sourceType === "health",
    };
  }
  return days;
}

export function compareTimelineEvents(left:Pick<TimelineEvent,"occurredAt"|"hasExplicitTime"|"id">,right:Pick<TimelineEvent,"occurredAt"|"hasExplicitTime"|"id">){const leftDay=dateInEvaOrbit(new Date(left.occurredAt)),rightDay=dateInEvaOrbit(new Date(right.occurredAt));if(leftDay!==rightDay)return rightDay.localeCompare(leftDay);if(left.hasExplicitTime!==right.hasExplicitTime)return left.hasExplicitTime?-1:1;if(left.hasExplicitTime&&left.occurredAt!==right.occurredAt)return right.occurredAt.localeCompare(left.occurredAt);return right.id.localeCompare(left.id);}
export function buildRelationTimelineEvents(events:RelationEvent[]):TimelineEvent[]{return events.map(event=>{const people=event.parties.flatMap(p=>p.personId?[p.personId]:[]);const detail=event.totalAmountMinor===null?(event.note||event.eventType):`¥${(event.totalAmountMinor/100).toFixed(2)}${event.note?` · ${event.note}`:""}`;return{id:`relation:${event.id}`,eventType:`relation.${event.eventType}`,sourceType:"person" as const,sourceId:event.id,title:event.title,detail,occurredAt:event.occurredAt,hasExplicitTime:event.occurredHasExplicitTime,endAt:null,href:people[0]?`/relations/${people[0]}`:"/relations",relatedPeople:people,relatedPets:[],metadata:{relationEventType:event.eventType,currency:event.currency,totalAmountMinor:event.totalAmountMinor,partyCount:event.parties.length}};}).sort(compareTimelineEvents);}
