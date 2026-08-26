import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelineEvents } from "./timeline.ts";
import type { DrinkLog, FoodLog, Tracker, TrackerEntry } from "./types.ts";

const food: FoodLog = {
  id: 7, occurredAt: "2026-08-26T04:00:00.000Z", mealType: "lunch", title: "午饭", description: "", portion: "半碗饭", scene: "home",
  estimatedKcal: 300, kcalMin: 260, kcalMax: 340, confidence: "medium", notes: "", imageUrl: null, attachmentId: null, createdAt: "", updatedAt: "",
};
const drink: DrinkLog = {
  id: 3, occurredAt: "2026-08-26T06:00:00.000Z", name: "咖啡", brand: "", drinkType: "coffee", volumeMl: 300, sugarLevel: "none",
  caffeineMg: 90, estimatedKcal: 5, kcalMin: 0, kcalMax: 10, confidence: "high", foodLibraryId: null, notes: "", createdAt: "", updatedAt: "",
};
const tracker: Tracker = {
  id: 11, name: "吃药", icon: "💊", iconType: "default", iconValue: "", groupName: "健康", timeType: "point", quickCaptureEnabled: true,
  dataSourceType: "native_tracker", sourceConfig: {}, statsConfig: {}, createdAt: "", updatedAt: "",
};
const trackerEntry: TrackerEntry = {
  id: 17, trackerId: 11, occurredAt: "2026-08-26T07:00:00.000Z", endAt: null, values: {}, note: "早饭后",
  sourceType: "native_tracker", createdAt: "", updatedAt: "",
};

test("merges module records into a newest-first timeline contract", () => {
  const events = buildTimelineEvents([food], [drink], [trackerEntry], [tracker]);
  assert.deepEqual(events.map((event) => event.id), ["tracker:17", "drink:3", "food:7"]);
  assert.equal(events[0].title, "吃药");
  assert.equal(events[0].href, "/trackers/11");
  assert.equal(events[1].eventType, "drink.logged");
  assert.equal(events[2].metadata.mealType, "lunch");
  assert.deepEqual(events[0].relatedPeople, []);
  assert.deepEqual(events[0].relatedPets, []);
});
