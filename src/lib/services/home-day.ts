import "server-only";

import { summarizeCalendarActivity, type HomeDayOverview } from "../home-day";
import { getRepository } from "../repositories";
import { dateInEvaOrbit, dateRange } from "../time";
import { getDailyTimelineOverview } from "./timeline";
import { getHealthKitSleepSamples } from "./sleep";
import { buildDailySleepSummary } from "../sleep";

const priorities: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function getHomeDayOverview(date = dateInEvaOrbit()): Promise<HomeDayOverview> {
  const repository = await getRepository();
  const range = dateRange(date);
  const [timeline, tasks, calendarEvents, journal, calendarInterpretation, sleepSamples] = await Promise.all([
    getDailyTimelineOverview(date),
    repository.listTasks("all"),
    repository.listCalendarEvents({ from: range.from, to: range.to, status: "confirmed", limit: 500 }),
    repository.listDailyJournalEntries({ date, limit: 100 }),
    repository.getCalendarInterpretation(),
    getHealthKitSleepSamples(date),
  ]);
  const calendar = summarizeCalendarActivity(calendarEvents, date, calendarInterpretation);
  return {
    date,
    events: timeline.events,
    tasks: tasks.filter((task) => task.dueDate === date).sort((a, b) => Number(a.completed) - Number(b.completed) || (priorities[a.priority] ?? 9) - (priorities[b.priority] ?? 9) || (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") || a.id - b.id).map(({ id, title, completed, dueTime, priority }) => ({ id, title, completed, dueTime, priority })),
    meals: timeline.events.filter((event) => event.sourceType === "food").map((event) => ({ mealType: String(event.metadata.mealType ?? "other"), title: event.title, detail: event.detail })),
    journal,
    calendarInterpretation,
    ...calendar,
    sleepSummary: buildDailySleepSummary(date, sleepSamples, calendar.sleep),
  };
}
