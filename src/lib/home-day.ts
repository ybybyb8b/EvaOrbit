import { dateInEvaOrbit, dateRange } from "./time.ts";
import type { CalendarEvent, DailyJournalEntry, TimelineEvent } from "./types.ts";
import { calendarCategoryLabel, defaultCalendarInterpretation, matchingCalendarRule, type CalendarInterpretation } from "./calendar-interpretation.ts";

export type HomeActivityCategory = "sleep" | "phone" | "screen" | "gaming";
type DayActivityCategory = string;
export const homeActivityLabels: Record<DayActivityCategory, { en: string; zh: string }> = {
  phone: { en: "phone use", zh: "手机使用" },
  screen: { en: "TV and movies", zh: "电视电影" },
  gaming: { en: "gaming", zh: "游戏" },
};

export function homeDurationLabel(minutes: number, english: boolean) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return english ? `${rest}m` : `${rest} 分钟`;
  return rest ? english ? `${hours}h ${rest}m` : `${hours} 小时 ${rest} 分` : english ? `${hours}h` : `${hours} 小时`;
}

export function homeActivitySentence(activities: HomeDayOverview["activities"], english: boolean, isToday: boolean) {
  const recorded = activities.filter((activity) => activity.durationMinutes > 0);
  if (!recorded.length) return null;
  const parts = recorded.map(activity => english
    ? `${homeDurationLabel(activity.durationMinutes, true)} of ${homeActivityLabel(activity, true)}`
    : `${homeDurationLabel(activity.durationMinutes, false)}${homeActivityLabel(activity, false)}`);
  const list = new Intl.ListFormat(english ? "en" : "zh-CN", { style: "long", type: "conjunction" }).format(parts);
  return english ? `${isToday ? "Recorded so far today" : "Recorded this day"}: ${list}.` : `${isToday ? "今天已记录" : "这一天，记录了"}${list}。`;
}

export function homeActivityLabel(activity: { category: string; label?: { en: string; zh: string } }, english: boolean) {
  const label = activity.label ?? homeActivityLabels[activity.category];
  return label ? english ? label.en : label.zh : activity.category;
}

export interface HomeSleepSummary {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  napCount: number;
  napMinutes: number;
  records: Array<{ id: number; title: string; startAt: string; endAt: string; durationMinutes: number; notes: string }>;
}

export interface HomeDayOverview {
  date: string;
  events: TimelineEvent[];
  tasks: Array<{ id: number; title: string; completed: boolean; dueTime: string | null; priority: string }>;
  meals: Array<{ mealType: string; title: string; detail: string | null }>;
  journal: DailyJournalEntry[];
  sleep: HomeSleepSummary | null;
  calendarInterpretation: CalendarInterpretation;
  activities: Array<{ category: string; label?: { en: string; zh: string }; durationMinutes: number }>;
  activityRecords: Array<{ id: number; category: DayActivityCategory; startAt: string; endAt: string; durationMinutes: number; notes: string }>;
}

export function classifyCalendarEvent(title: string, settings = defaultCalendarInterpretation()): string | null {
  return matchingCalendarRule(title, settings)?.categoryId ?? null;
}

export function summarizeCalendarActivity(events: CalendarEvent[], date: string, settings = defaultCalendarInterpretation()) {
  const range = dateRange(date);
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const categories = settings.categories.filter(category => category.kind === "activity" && settings.rules.some(rule => rule.categoryId === category.id && rule.enabled && rule.includeInSummary));
  const totals = new Map(categories.map(category => [category.id, 0]));
  const sleeps: HomeSleepSummary["records"] = [];
  const activityRecords: HomeDayOverview["activityRecords"] = [];

  for (const event of events) {
    const rule = matchingCalendarRule(event.title, settings), category = settings.categories.find(category => category.id === rule?.categoryId);
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();
    if (!category || event.isAllDay || event.status !== "confirmed" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= from || start >= to) continue;
    if (category.kind === "sleep") {
      if (dateInEvaOrbit(new Date(end)) === date) sleeps.push({ id: event.id, title: event.title, notes: event.notes, startAt: event.startAt, endAt: event.endAt, durationMinutes: Math.round((end - start) / 60_000) });
      continue;
    }
    if (!rule?.includeInSummary) continue;
    const clippedStart = Math.max(start, from), clippedEnd = Math.min(end, to);
    totals.set(category.id, (totals.get(category.id) ?? 0) + clippedEnd - clippedStart);
    activityRecords.push({ id: event.id, category: category.id, startAt: new Date(clippedStart).toISOString(), endAt: new Date(clippedEnd).toISOString(), durationMinutes: Math.round((clippedEnd - clippedStart) / 60_000), notes: event.notes });
  }

  sleeps.sort((a, b) => b.durationMinutes - a.durationMinutes);
  const main = sleeps[0] ?? null;
  const naps = sleeps.slice(1);
  return {
    sleep: main ? { ...main, napCount: naps.length, napMinutes: naps.reduce((sum, item) => sum + item.durationMinutes, 0), records: sleeps } : null,
    activities: categories.map(category => ({ category: category.id, label: { en: calendarCategoryLabel(category, true), zh: calendarCategoryLabel(category, false) }, durationMinutes: Math.round((totals.get(category.id) ?? 0) / 60_000) })),
    activityRecords: activityRecords.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id - b.id),
  };
}
