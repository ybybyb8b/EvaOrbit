import "server-only";

import { homeMeals, summarizeCalendarActivity, type HomeDayOverview } from "../home-day";
import { getRepository } from "../repositories";
import { dateInEvaOrbit } from "../time";
import { getDailyTimelineOverview } from "./timeline";
import { getHealthKitSleepSamples } from "./sleep";
import { buildDailySleepSummary } from "../sleep";

const priorities: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function getHomeDayOverview(date = dateInEvaOrbit(), options: { readOnly?: boolean } = {}): Promise<HomeDayOverview> {
  const repository = await getRepository();
  const [timeline, tasks, journal, sleepSamples] = await Promise.all([
    getDailyTimelineOverview(date, options),
    repository.listTasks("all", date),
    repository.listDailyJournalEntries({ date, limit: 100 }),
    getHealthKitSleepSamples(date),
  ]);
  const { calendarEvents, calendarInterpretation } = timeline;
  const calendar = summarizeCalendarActivity(calendarEvents, date, calendarInterpretation);
  return {
    date,
    events: timeline.events,
    tasks: tasks.filter((task) => task.dueDate === date).sort((a, b) => Number(a.completed) - Number(b.completed) || (priorities[a.priority] ?? 9) - (priorities[b.priority] ?? 9) || (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") || a.id - b.id).map(({ id, title, completed, dueTime, priority }) => ({ id, title, completed, dueTime, priority })),
    meals: homeMeals(timeline.mealEvents),
    journal,
    calendarInterpretation,
    ...calendar,
    sleepSummary: buildDailySleepSummary(date, sleepSamples, calendar.sleep),
  };
}
