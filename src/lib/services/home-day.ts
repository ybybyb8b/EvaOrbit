import "server-only";
import { importantDateStats, sortImportantDates } from "../important-dates";

import { homeMeals, summarizeCalendarActivity, type HomeDayOverview } from "../home-day";
import { getRepository } from "../repositories";
import { dateInEvaOrbit, dateRange } from "../time";
import { getDailyTimelineOverview } from "./timeline";
import { getHealthKitSleepSamples } from "./sleep";
import { buildDailySleepSummary } from "../sleep";

import { homeCompletions } from "../home-completions";
import { subjectLabel } from "./reminder";

const priorities: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function getHomeDayOverview(date?: string, options: { readOnly?: boolean } = {}): Promise<HomeDayOverview> {
  const today = dateInEvaOrbit();
  date ??= today;
  const includeOverdue = date === today;
  const repository = await getRepository();
  const range = dateRange(date);
  const [timeline, tasks, journal, sleepSamples, occurrences, pets, importantDates] = await Promise.all([
    getDailyTimelineOverview(date, options),
    repository.listTasks("all", date, range, includeOverdue),
    repository.listDailyJournalEntries({ date, limit: 100 }),
    getHealthKitSleepSamples(date),
    repository.listReminderOccurrences(range,date),
    repository.listPets(),
    repository.listImportantDates(),
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
  const routineIds = new Set(timeline.events.flatMap(event =>
    event.sourceType==="cat" && event.metadata.sourceType==="cat_routine" && typeof event.metadata.sourceId==="number" ? [event.metadata.sourceId] : []));
  const routines = await Promise.all([...routineIds].map(id => repository.getCatRoutine(id)));
  const undoableEvents = new Set(routines.flatMap(routine => routine?.undoableEventId ? [routine.undoableEventId] : []));
  const { calendarEvents, calendarInterpretation } = timeline;
  const calendar = summarizeCalendarActivity(calendarEvents, date, calendarInterpretation);
  return {
    importantDates: sortImportantDates(importantDates.filter(item => !item.archived && (item.pinned || (() => { const days=importantDateStats(item,date).remaining;return days!==null&&days>=0&&days<=30; })())), date).slice(0,4),
    date,
    events: timeline.events,
    tasks: tasks.filter((task) => task.completed && task.completedOn ? task.completedOn === date : !task.completed || task.dueDate === date)
      .sort((a, b) => Number(a.completed) - Number(b.completed) || (priorities[a.priority] ?? 9) - (priorities[b.priority] ?? 9) || (!a.completed ? (a.dueDate ?? "").localeCompare(b.dueDate ?? "") : 0) || (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") || a.id - b.id)
      .map(({ id, title, completed, completedAt, completedOn, dueDate, dueTime, priority }) => ({ id, title, completed, completedAt, completedOn, dueDate, dueTime, priority })),
    completedItems: homeCompletions(date, completionRecords, timeline.events, new Map(pets.map(pet => [pet.id,pet.name])), undoableEvents),
    meals: homeMeals(timeline.mealEvents),
    journal,
    calendarInterpretation,
    ...calendar,
    sleepSummary: buildDailySleepSummary(date, sleepSamples, calendar.sleep),
  };
}
