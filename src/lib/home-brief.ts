import type { DailyNutritionSummary, DueReminder, Pet, Reminder, Subscription, TimelineEvent } from "./types.ts";
import { dateInEvaOrbit } from "./time.ts";

export type HomeBriefPeriod = "yesterday" | "today";
export type HomeBriefItemType = "energy" | "training" | "health" | "cats" | "task" | "subscription";

export interface HomeBriefItem {
  period: HomeBriefPeriod;
  type: HomeBriefItemType;
  text: string;
  value?: string;
  priority: number;
  href?: string;
}

export interface HomeBrief {
  updatedAt: string;
  items: HomeBriefItem[];
}

type BuildHomeBriefInput = {
  today: string;
  yesterday: string;
  yesterdayEvents: TimelineEvent[];
  yesterdayNutrition: DailyNutritionSummary;
  due: DueReminder[];
  subscriptions: Subscription[];
  reminders: Reminder[];
  pets: Pet[];
  english: boolean;
  updatedAt: string;
};

const trainingLabels = {
  cardio: { en: "Cardio", zh: "有氧训练" },
  strength: { en: "Strength training", zh: "力量训练" },
  mixed: { en: "Mixed training", zh: "混合训练" },
} as const;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function yesterdayItems(input: BuildHomeBriefInput): HomeBriefItem[] {
  const items: HomeBriefItem[] = [];
  const { english, yesterdayEvents: events, yesterdayNutrition: nutrition } = input;
  if (nutrition.energyBalance !== null && nutrition.totalExpenditureKcal !== null && nutrition.estimatedIntakeKcal > 0) {
    const balance = Math.round(nutrition.energyBalance);
    items.push({
      period: "yesterday", type: "energy", text: english ? "Calorie balance" : "热量差",
      value: `${balance > 0 ? "+" : ""}${balance.toLocaleString(english ? "en-US" : "zh-CN")} kcal`, priority: 100, href: "/health",
    });
  }

  const training = events.filter((item) => item.sourceType === "training");
  if (training.length) {
    const courses = [...new Set(training.map((item) => typeof item.metadata.course === "string" ? item.metadata.course.trim() : "").filter(Boolean))];
    const types = [...new Set(training.map((item) => typeof item.metadata.trainingType === "string" ? item.metadata.trainingType : "").filter(Boolean))];
    const label = courses.length === 1 ? courses[0] : types.length === 1 && types[0] in trainingLabels
      ? trainingLabels[types[0] as keyof typeof trainingLabels][english ? "en" : "zh"]
      : english ? "Training" : "训练";
    items.push({ period: "yesterday", type: "training", text: english ? `${label}, ${training.length} session${training.length === 1 ? "" : "s"}` : `${label} ${training.length} 次`, priority: 90, href: "/health" });
  }

  const petNames = new Map(input.pets.map((pet) => [String(pet.id), pet.name]));
  for (const event of events.filter((item) => item.sourceType === "cat" && item.metadata.sourceType === "cat_routine")) {
    const pet = event.relatedPets[0] ? petNames.get(String(event.relatedPets[0])) : null;
    items.push({ period: "yesterday", type: "cats", text: english ? `${pet ? `${pet} ` : ""}${event.title} completed` : `${pet ? `${pet} ` : ""}${event.title}已完成`, priority: 80, href: event.href ?? "/cats" });
  }

  const health = events.find((item) => item.sourceType === "health" && ["symptom", "condition", "visit", "test"].includes(String(item.metadata.type ?? "")));
  if (health) items.push({ period: "yesterday", type: "health", text: english ? `${health.title}: ${health.detail}` : `${health.title}：${health.detail}`, priority: 70, href: health.href ?? "/health" });

  for (const event of events.filter((item) => item.sourceType === "subscription")) {
    items.push({ period: "yesterday", type: "subscription", text: english ? `${event.title} payment recorded` : `${event.title} 已扣款`, priority: 65, href: event.href ?? "/subscriptions" });
  }

  const completedTask = input.reminders.find((item) => item.targetType === "task" && item.lastCompletedAt && dateInEvaOrbit(new Date(item.lastCompletedAt)) === input.yesterday);
  if (completedTask) items.push({ period: "yesterday", type: "task", text: english ? `${completedTask.title} completed` : `${completedTask.title}已完成`, priority: 60, href: "/tasks" });
  return items.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

function todayItems(input: BuildHomeBriefInput): HomeBriefItem[] {
  const items: HomeBriefItem[] = [];
  if (input.due.length) items.push({
    period: "today", type: "task",
    text: input.english ? `${input.due.length} item${input.due.length === 1 ? "" : "s"} need attention today` : `今天有 ${input.due.length} 项待处理`,
    priority: 100, href: "/notifications",
  });

  const upcoming = input.subscriptions
    .filter((item) => item.status === "active")
    .map((item) => ({ item, days: daysBetween(input.today, item.nextRenewalOn) }))
    .filter(({ days }) => days > 0 && days <= 7)
    .sort((a, b) => a.days - b.days)[0];
  if (upcoming) items.push({
    period: "today", type: "subscription",
    text: input.english ? `${upcoming.item.name} renews in ${upcoming.days} day${upcoming.days === 1 ? "" : "s"}` : `${upcoming.item.name} ${upcoming.days} 天后续费`,
    priority: 70, href: `/subscriptions/${upcoming.item.id}`,
  });
  return items.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

export function buildHomeBrief(input: BuildHomeBriefInput): HomeBrief {
  return { updatedAt: input.updatedAt, items: [...yesterdayItems(input), ...todayItems(input)] };
}
