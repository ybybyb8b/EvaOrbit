import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeBrief } from "./home-brief.ts";
import type { DailyNutritionSummary, DueReminder, Pet, Reminder, Subscription, TimelineEvent } from "./types.ts";

const nutrition: DailyNutritionSummary = {
  date: "2026-09-19", estimatedIntakeKcal: 1630, intakeMin: 1600, intakeMax: 1660,
  restingEnergyKcal: 1700, activeEnergyKcal: 300, totalExpenditureKcal: 2000,
  energyBalance: -370, energyBalanceMin: -400, energyBalanceMax: -340, confidence: "high", notes: "",
};

const training = {
  id: "training:1", eventType: "training.logged", sourceType: "training", sourceId: 1,
  title: "Upper body", detail: "", occurredAt: "2026-09-19T10:00:00.000Z", hasExplicitTime: true,
  endAt: null, href: "/health?training=1", relatedPeople: [], relatedPets: [], metadata: { trainingType: "strength", course: "" },
} satisfies TimelineEvent;

const catRoutine = {
  id: "cat:event:1", eventType: "cat.care", sourceType: "cat", sourceId: 1,
  title: "梳毛", detail: "", occurredAt: "2026-09-19T11:00:00.000Z", hasExplicitTime: true,
  endAt: null, href: "/cats/2", relatedPeople: [], relatedPets: [2], metadata: { sourceType: "cat_routine" },
} satisfies TimelineEvent;

function build(overrides: Partial<Parameters<typeof buildHomeBrief>[0]> = {}) {
  return buildHomeBrief({
    today: "2026-09-20", yesterday: "2026-09-19", yesterdayEvents: [training, catRoutine], yesterdayNutrition: nutrition,
    due: [{ id: 1 }, { id: 2 }] as DueReminder[], subscriptions: [], reminders: [],
    pets: [{ id: 2, name: "Luna" } as Pet], english: false, updatedAt: "2026-09-20T04:35:00.000Z", ...overrides,
  });
}

test("builds a concise priority-ordered brief from real summary shapes", () => {
  const brief = build();
  assert.deepEqual(brief.items.map((item) => item.type), ["energy", "training", "cats", "task"]);
  assert.equal(brief.items[0].value, "-370 kcal");
  assert.equal(brief.items[2].text, "Luna 梳毛已完成");
  assert.equal(brief.items[3].text, "今天有 2 项待处理");
  assert.equal(brief.items[3].href, "/notifications");
});

test("omits calorie balance until intake and expenditure are both present", () => {
  const brief = build({ yesterdayNutrition: { ...nutrition, estimatedIntakeKcal: 0 } });
  assert.equal(brief.items.some((item) => item.type === "energy"), false);
});

test("keeps today short and surfaces the nearest upcoming renewal", () => {
  const subscriptions = [
    { id: 3, name: "Later", status: "active", nextRenewalOn: "2026-09-26" },
    { id: 4, name: "ChatGPT", status: "active", nextRenewalOn: "2026-09-23" },
  ] as Subscription[];
  const brief = build({ subscriptions, due: [] });
  const today = brief.items.filter((item) => item.period === "today");
  assert.deepEqual(today.map((item) => item.text), ["ChatGPT 3 天后续费"]);
  assert.equal(today[0].href, "/subscriptions/4");
});

test("uses a completed task reminder only when it was acted on yesterday", () => {
  const reminders = [{ targetType: "task", title: "提交报告", lastCompletedAt: "2026-09-19T04:00:00.000Z" }] as Reminder[];
  const brief = build({ yesterdayEvents: [], yesterdayNutrition: { ...nutrition, estimatedIntakeKcal: 0 }, due: [], reminders });
  assert.equal(brief.items[0].text, "提交报告已完成");
});
