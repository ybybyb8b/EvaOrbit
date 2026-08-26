import type { DrinkLog, FoodLog, TimelineEvent, Tracker, TrackerEntry } from "./types";

export function buildTimelineEvents(foods: FoodLog[], drinks: DrinkLog[], trackerEntries: TrackerEntry[] = [], trackers: Tracker[] = []): TimelineEvent[] {
  const foodEvents: TimelineEvent[] = foods.map((item) => ({
    id: `food:${item.id}`,
    eventType: "food.logged",
    sourceType: "food",
    sourceId: item.id,
    title: item.title,
    detail: item.portion || item.description || "饮食记录",
    occurredAt: item.occurredAt,
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
    endAt: null,
    href: "/drinks",
    relatedPeople: [],
    relatedPets: [],
    metadata: { drinkType: item.drinkType, brand: item.brand, volumeMl: item.volumeMl, estimatedKcal: item.estimatedKcal, confidence: item.confidence },
  }));
  const trackerMap = new Map(trackers.map((tracker) => [tracker.id, tracker]));
  const trackerEvents: TimelineEvent[] = trackerEntries.filter((entry) => entry.sourceType === "native_tracker").map((entry) => {
    const tracker = trackerMap.get(entry.trackerId);
    return {
      id: `tracker:${entry.id}`, eventType: "tracker.logged", sourceType: "tracker", sourceId: entry.id,
      title: tracker ? tracker.name : "Tracker record", detail: entry.note || "Recorded a moment",
      occurredAt: entry.occurredAt, endAt: entry.endAt, href: `/trackers/${entry.trackerId}`,
      relatedPeople: [], relatedPets: [], metadata: { trackerId: entry.trackerId, values: entry.values },
    };
  });
  return [...foodEvents, ...drinkEvents, ...trackerEvents].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
}
