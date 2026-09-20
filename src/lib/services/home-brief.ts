import "server-only";

import { buildHomeBrief } from "../home-brief";
import { getRepository } from "../repositories";
import { dateInEvaOrbit, shiftDate } from "../time";
import { getDailyNutritionSummary } from "./nutrition";
import { getDueReminders } from "./reminder";
import { listTimeline } from "./timeline";

export async function getHomeBriefOverview(english: boolean, now = new Date()) {
  const today = dateInEvaOrbit(now);
  const yesterday = shiftDate(today, -1);
  const repository = await getRepository();
  const due = await getDueReminders(50, now);
  const [yesterdayEvents, yesterdayNutrition, subscriptions, reminders, pets] = await Promise.all([
    listTimeline({ date: yesterday }),
    getDailyNutritionSummary(yesterday),
    repository.listSubscriptions({ status: "active", limit: 500 }),
    repository.listReminders(),
    repository.listPets(),
  ]);
  return {
    brief: buildHomeBrief({ today, yesterday, yesterdayEvents, yesterdayNutrition, due, subscriptions, reminders, pets, english, updatedAt: new Date().toISOString() }),
    due,
  };
}
