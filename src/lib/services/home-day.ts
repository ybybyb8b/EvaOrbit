import "server-only";

import { homeMeals, summarizeCalendarActivity, type HomeDayOverview } from "../home-day";
import { getRepository } from "../repositories";
import { dateInEvaOrbit, dateRange } from "../time";
import { getDailyTimelineOverview } from "./timeline";
import { getHealthKitSleepSamples } from "./sleep";
import { buildDailySleepSummary } from "../sleep";

import { homeCompletions } from "../home-completions";
import { subjectLabel } from "./reminder";

const priorities: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function getHomeDayOverview(date = dateInEvaOrbit(), options: { readOnly?: boolean } = {}): Promise<HomeDayOverview> {
  const repository = await getRepository();
  const range = dateRange(date);
  const [timeline, tasks, journal, sleepSamples, occurrences, pets] = await Promise.all([
    getDailyTimelineOverview(date, options),
    repository.listTasks("all", date, range),
    repository.listDailyJournalEntries({ date, limit: 100 }),
    getHealthKitSleepSamples(date),
    repository.listReminderOccurrences(range),
    repository.listPets(),
  ]);
  const reminderIds = [...new Set(occurrences.map(item => item.reminderId))];
  const reminderRecords = await Promise.all(reminderIds.map(async id => {
    const reminder = await repository.getReminder(id);
    return reminder ? {reminder, subjectLabel: await subjectLabel(reminder)} : null;
  }));
  const completionRecords = occurrences.flatMap(occurrence => {
    const record = reminderRecords.find(item => item?.reminder.id === occurrence.reminderId);
    return record ? [{...record, occurrence}] : [];
  });
  const { calendarEvents, calendarInterpretation } = timeline;
  const calendar = summarizeCalendarActivity(calendarEvents, date, calendarInterpretation);
  return {
    date,
    events: timeline.events,
    tasks: tasks.filter((task) => task.completed && task.completedAt ? dateInEvaOrbit(new Date(task.completedAt)) === date : task.dueDate === date).sort((a, b) => Number(a.completed) - Number(b.completed) || (priorities[a.priority] ?? 9) - (priorities[b.priority] ?? 9) || (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") || a.id - b.id).map(({ id, title, completed, completedAt, dueTime, priority }) => ({ id, title, completed, completedAt, dueTime, priority })),
    completedItems: homeCompletions(date, completionRecords, timeline.events, new Map(pets.map(pet => [pet.id,pet.name]))),
    meals: homeMeals(timeline.mealEvents),
    journal,
    calendarInterpretation,
    ...calendar,
    sleepSummary: buildDailySleepSummary(date, sleepSamples, calendar.sleep),
  };
}
