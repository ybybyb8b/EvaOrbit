import type { DrinkLog, FoodLog, HealthRecord, RelationEvent, TimelineEvent, Tracker, TrackerEntry } from "./types";
import { dateInEvaOrbit } from "./time.ts";

export function buildTimelineEvents(foods: FoodLog[], drinks: DrinkLog[], trackerEntries: TrackerEntry[] = [], trackers: Tracker[] = [], healthRecords: HealthRecord[] = []): TimelineEvent[] {
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
    metadata: { mealType: item.mealType, scene: item.scene, estimatedKcal: item.estimatedKcal, confidence: item.confidence },
  }));
  const drinkEvents: TimelineEvent[] = drinks.map((item) => ({
    id: `drink:${item.id}`,
    eventType: "drink.logged",
    sourceType: "drink",
    sourceId: item.id,
    title: item.name,
    detail: item.volumeMl ? `${item.volumeMl} ml` : item.brand || "饮品记录",
    occurredAt: item.occurredAt,
    hasExplicitTime: true,
    endAt: null,
    href: "/drinks",
    relatedPeople: [],
    relatedPets: [],
    metadata: { drinkType: item.drinkType, brand: item.brand, volumeMl: item.volumeMl, estimatedKcal: item.estimatedKcal, confidence: item.confidence },
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
  return [...foodEvents, ...drinkEvents, ...trackerEvents, ...healthEvents].sort(compareTimelineEvents);
}

export function compareTimelineEvents(left:Pick<TimelineEvent,"occurredAt"|"hasExplicitTime"|"id">,right:Pick<TimelineEvent,"occurredAt"|"hasExplicitTime"|"id">){const leftDay=dateInEvaOrbit(new Date(left.occurredAt)),rightDay=dateInEvaOrbit(new Date(right.occurredAt));if(leftDay!==rightDay)return rightDay.localeCompare(leftDay);if(left.hasExplicitTime!==right.hasExplicitTime)return left.hasExplicitTime?-1:1;if(left.hasExplicitTime&&left.occurredAt!==right.occurredAt)return right.occurredAt.localeCompare(left.occurredAt);return right.id.localeCompare(left.id);}
export function buildRelationTimelineEvents(events:RelationEvent[]):TimelineEvent[]{return events.map(event=>{const people=event.parties.flatMap(p=>p.personId?[p.personId]:[]);const detail=event.totalAmountMinor===null?(event.note||event.eventType):`¥${(event.totalAmountMinor/100).toFixed(2)}${event.note?` · ${event.note}`:""}`;return{id:`relation:${event.id}`,eventType:`relation.${event.eventType}`,sourceType:"person" as const,sourceId:event.id,title:event.title,detail,occurredAt:event.occurredAt,hasExplicitTime:event.occurredHasExplicitTime,endAt:null,href:people[0]?`/relations/${people[0]}`:"/relations",relatedPeople:people,relatedPets:[],metadata:{relationEventType:event.eventType,currency:event.currency,totalAmountMinor:event.totalAmountMinor,partyCount:event.parties.length}};}).sort(compareTimelineEvents);}
