import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRelationTimelineEvents, buildTimelineEvents, buildTrainingTimelineEvents, groupMealTimelineEvents, periodDayForDate, periodRangesForCalendar, summarizeTimelineDays } from "./timeline.ts";
import type { DrinkLog, FoodLog, HealthRecord, MedicationDoseEvent, MenstrualFlowRecord, MenstrualPeriod, RelationEvent, RelationPerson, TrainingLog, Tracker, TrackerEntry, WeightRecord } from "./types.ts";

const food: FoodLog = {
  id: 7, occurredAt: "2026-08-26T04:00:00.000Z", mealType: "lunch", title: "午饭", description: "", portion: "半碗饭", scene: "home", rating: null,
  estimatedKcal: 300, kcalMin: 260, kcalMax: 340, confidence: "medium", notes: "", imageUrl: null, attachmentId: null, createdAt: "", updatedAt: "",
};
const drink: DrinkLog = {
  id: 3, occurredAt: "2026-08-26T06:00:00.000Z", occurredHasExplicitTime: true, name: "咖啡", brand: "", drinkType: "coffee", volumeMl: 300, sugarLevel: "none", temperature: null, rating: null,
  caffeineMg: 90, estimatedKcal: 5, kcalMin: 0, kcalMax: 10, confidence: "high", foodLibraryId: null, notes: "", createdAt: "", updatedAt: "",
};
const tracker: Tracker = {
  id: 11, name: "吃药", icon: "💊", iconType: "default", iconValue: "", groupName: "健康", timeType: "point", quickCaptureEnabled: true,
  statsConfig: {}, createdAt: "", updatedAt: "",
};
const trackerEntry: TrackerEntry = {
  id: 17, trackerId: 11, occurredAt: "2026-08-26T07:00:00.000Z", endAt: null, values: {}, note: "早饭后",
  createdAt: "", updatedAt: "",
};
const healthRecord: HealthRecord = {
  id: 19, occurredAt: "2026-08-26T08:00:00.000Z", occurredHasExplicitTime: true, type: "symptom", title: "Headache", summary: "Mild",
  status: "active", startedAt: null, startedHasExplicitTime: true, endedAt: null, endedHasExplicitTime: true, details: { severity: "mild" }, createdAt: "", updatedAt: "",
};
const trainingLog: TrainingLog = {
  id: 23, occurredAt: "2026-08-26T05:00:00.000Z", occurredHasExplicitTime: false, trainingType: "strength", bodyParts: ["背", "核心"],
  teacher: "Eva", course: "Core flow", durationMinutes: 45, notes: "", createdAt: "", updatedAt: "",
};
const weightRecord:WeightRecord={id:29,occurredAt:"2026-08-26T09:00:00.000Z",occurredHasExplicitTime:true,weightKg:64.25,source:"apple_health",healthKitSampleId:"946e6cf1-96f2-4e47-9d45-b0fab32db24d",healthKitSourceBundle:"com.apple.Health",healthKitSourceName:"Health",healthKitSyncIdentifier:null,healthKitSyncVersion:1,createdAt:"",updatedAt:""};
const menstrualFlow:MenstrualFlowRecord={id:31,periodId:5,occurredAt:"2026-08-26T10:00:00.000Z",endedAt:"2026-08-26T10:00:00.000Z",occurredHasExplicitTime:false,flow:"medium",isCycleStart:true,notes:"",source:"manual",healthKitSampleId:null,healthKitSourceBundle:null,healthKitSourceName:null,healthKitSyncIdentifier:"evaorbit.menstrual_flow.test",healthKitSyncVersion:1,healthKitSyncStatus:"pending",deletedAt:null,createdAt:"",updatedAt:""};
const medicationDose:MedicationDoseEvent={id:32,medicationPresetId:6,periodId:5,takenAt:"2026-08-26T11:00:00.000Z",medicationNameSnapshot:"My medication",doseText:"1 tablet",notes:"",createdAt:"",updatedAt:""};
const relationPerson:RelationPerson={id:41,name:"林小姐",nickname:"小林",relationLabel:"朋友",closenessRank:4,relationshipStatus:"active",photoPath:null,birthday:null,likes:null,avoid:null,note:null,archivedAt:null,createdAt:"",updatedAt:""};
const relationExpense:RelationEvent={id:42,eventType:"expense",title:"晚餐",note:"AA 消费",occurredAt:"2026-08-26T12:00:00.000Z",occurredHasExplicitTime:true,currency:"CNY",totalAmountMinor:30000,isInPerson:true,parties:[{id:1,partyType:"self",personId:null,shareAmountMinor:10000,paidAmountMinor:30000},{id:2,partyType:"person",personId:41,shareAmountMinor:20000,paidAmountMinor:0}],items:[],flows:[],createdAt:"",updatedAt:""};

test("merges module records into a newest-first timeline contract", () => {
  const events = buildTimelineEvents([food], [drink], [trackerEntry], [tracker], [healthRecord]);
  assert.deepEqual(events.map((event) => event.id), ["health:19", "tracker:17", "drink:3", "food:7"]);
  assert.equal(events[0].href, "/health/records/19");
  assert.equal(events[0].metadata.status, "active");
  assert.equal(events[1].title, "吃药");
  assert.equal(events[1].href, "/trackers/11");
  assert.equal(events[2].eventType, "drink.logged");
  assert.equal(events[3].metadata.mealType, "lunch");
  assert.deepEqual(events[0].relatedPeople, []);
  assert.deepEqual(events[0].relatedPets, []);
});

test("puts timed events before date-only events on the same EvaOrbit day", () => {
  const dateOnlyHealth = { ...healthRecord, id: 20, occurredAt: "2026-08-26T04:00:00.000Z", occurredHasExplicitTime: false };
  const events = buildTimelineEvents([food], [], [], [], [dateOnlyHealth]);
  assert.deepEqual(events.map((event) => event.id), ["food:7", "health:20"]);
  assert.equal(events[1].hasExplicitTime, false);
});

test("groups food records into one home timeline row per meal", () => {
  const secondFood = { ...food, id: 8, title: "青菜", portion: "一碟" };
  const events = groupMealTimelineEvents(buildTimelineEvents([food, secondFood], [drink]));
  assert.deepEqual(events.map((event) => event.id), ["drink:3", "food-meal:lunch:2026-08-26"]);
  assert.equal(events[1].eventType, "food.meal");
  assert.equal(events[1].metadata.count, 2);
  assert.deepEqual(events[1].metadata.foodItems, [{ title: "青菜", detail: "一碟" }, { title: "午饭", detail: "半碗饭" }]);
});

test("maps training logs into editable date-aware timeline events", () => {
  const [event] = buildTrainingTimelineEvents([trainingLog]);
  assert.equal(event.sourceType, "training");
  assert.equal(event.hasExplicitTime, false);
  assert.equal(event.href, "/health?training=23");
  assert.equal(event.metadata.trainingType, "strength");
  assert.match(event.detail, /45 min/);
});

test("shows relation companions and the user's AA share instead of the full bill",()=>{
  const [event]=buildRelationTimelineEvents([relationExpense],[relationPerson]);
  assert.equal(event.detail,"小林 · AA ¥100.00 · AA 消费");
  assert.deepEqual(event.relatedPeople,[41]);
  assert.equal(event.metadata.selfShareAmountMinor,10000);
  assert.equal(event.metadata.totalAmountMinor,30000);
  assert.deepEqual(event.metadata.personNames,["小林"]);
});

test("maps every weight sample into the Health timeline without daily deduplication",()=>{
  const events=buildTimelineEvents([],[],[],[],[],[weightRecord,{...weightRecord,id:30,weightKg:64.4}]);
  assert.deepEqual(events.map(item=>item.id),["weight:30","weight:29"]);
  assert.equal(events[0].eventType,"health.weight");
  assert.equal(events[0].href,"/health#weight-title");
  assert.match(events[0].detail!,/Health/);
  assert.match(events[1].detail!,/^64\.25 kg/);
});

test("maps menstrual flow and dose facts without projecting a period episode",()=>{
  const events=buildTimelineEvents([],[],[],[],[],[],[menstrualFlow],[medicationDose]);
  assert.deepEqual(events.map(item=>item.eventType),["health.medication_dose","health.menstrual_flow"]);
  assert.equal(events.every(item=>item.sourceType==="health"),true);
  assert.equal(events.some(item=>item.eventType==="health.period"),false);
  assert.equal(events[0].metadata.periodId,5);
});

test("marks health and training days as important while retaining an accessible count", () => {
  const ordinary = groupMealTimelineEvents(buildTimelineEvents([food], [drink]));
  const important = [...buildTimelineEvents([], [], [], [], [healthRecord]), ...buildTrainingTimelineEvents([trainingLog])];
  const summary = summarizeTimelineDays([...ordinary, ...important]);
  assert.deepEqual(summary["2026-08-26"], { count: 4, highlighted: true });

  const foodOnly = summarizeTimelineDays(groupMealTimelineEvents(buildTimelineEvents([food], [])));
  assert.deepEqual(foodOnly["2026-08-26"], { count: 1, highlighted: false });

  const weightOnly = summarizeTimelineDays(buildTimelineEvents([], [], [], [], [], [weightRecord]));
  assert.deepEqual(weightOnly["2026-08-26"], { count: 1, highlighted: false });
});

test("finds a period day without extending an active period beyond today", () => {
  const active: MenstrualPeriod = { id: 5, startedOn: "2026-08-26", endedOn: null, notes: "", createdAt: "", updatedAt: "" };
  assert.equal(periodDayForDate([active], "2026-08-27", "2026-08-28")?.day, 2);
  assert.equal(periodDayForDate([active], "2026-08-29", "2026-08-28"), null);
});

test("limits an open calendar ribbon to confirmed menstrual flow", () => {
  const active: MenstrualPeriod = { id: 5, startedOn: "2026-08-26", endedOn: null, notes: "", createdAt: "", updatedAt: "" };
  const ranges = periodRangesForCalendar([active], [
    menstrualFlow,
    { ...menstrualFlow, id: 32, occurredAt: "2026-08-30T04:00:00.000Z", endedAt: "2026-08-30T04:00:00.000Z", isCycleStart: false },
    { ...menstrualFlow, id: 33, occurredAt: "2026-09-01T04:00:00.000Z", endedAt: "2026-09-01T04:00:00.000Z", flow: "none", isCycleStart: false },
  ], "2026-09-14");
  assert.equal(ranges[0].endedOn, "2026-08-30");
  assert.equal(active.endedOn, null);
});

test("treats a HealthKit midnight end as exclusive for the calendar ribbon", () => {
  const active: MenstrualPeriod = { id: 5, startedOn: "2026-08-26", endedOn: null, notes: "", createdAt: "", updatedAt: "" };
  const [range] = periodRangesForCalendar([active], [{ ...menstrualFlow, occurredAt: "2026-08-30T16:00:00.000Z", endedAt: "2026-08-31T16:00:00.000Z" }], "2026-09-14");
  assert.equal(range.endedOn, "2026-08-31");
});

test("month summaries use the complete open-period flow history across a month boundary", () => {
  const service = readFileSync(new URL("./services/timeline.ts", import.meta.url), "utf8");
  assert.match(service, /listMenstrualFlowRecords\(\{ periodId: openPeriod\.id, limit: 500 \}\)/);
  assert.doesNotMatch(service, /periodRangesForCalendar\([^\n]+sources\.menstrualFlows/);
});
