import { dateInEvaOrbit, dateRange } from "./time.ts";
import type { CalendarEvent, DailyJournalEntry, TimelineEvent } from "./types.ts";

export type HomeActivityCategory = "sleep" | "phone" | "screen" | "gaming";

const activityPrefixes: ReadonlyArray<readonly [string, HomeActivityCategory]> = [
  ["😴", "sleep"],
  ["🍠", "phone"],
  ["📺", "screen"],
  ["🎮", "gaming"],
];

export interface HomeSleepSummary {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  napCount: number;
  napMinutes: number;
}

export interface HomeDayOverview {
  date: string;
  events: TimelineEvent[];
  tasks: Array<{ id: number; title: string; completed: boolean; dueTime: string | null; priority: string }>;
  meals: Array<{ mealType: string; title: string; detail: string | null }>;
  journal: DailyJournalEntry[];
  sleep: HomeSleepSummary | null;
  activities: Array<{ category: Exclude<HomeActivityCategory, "sleep">; durationMinutes: number }>;
}

export function classifyCalendarEvent(title: string): HomeActivityCategory | null {
  const normalized = title.trimStart();
  return activityPrefixes.find(([prefix]) => normalized.startsWith(prefix))?.[1] ?? null;
}

export function summarizeCalendarActivity(events: CalendarEvent[], date: string) {
  const range = dateRange(date);
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const totals = { phone: 0, screen: 0, gaming: 0 };
  const sleeps: Array<{ startAt: string; endAt: string; durationMinutes: number }> = [];

  for (const event of events) {
    const category = classifyCalendarEvent(event.title);
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();
    if (!category || event.isAllDay || event.status !== "confirmed" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= from || start >= to) continue;
    if (category === "sleep") {
      if (dateInEvaOrbit(new Date(end)) === date) sleeps.push({ startAt: event.startAt, endAt: event.endAt, durationMinutes: Math.round((end - start) / 60_000) });
      continue;
    }
    totals[category] += Math.max(0, Math.min(end, to) - Math.max(start, from));
  }

  sleeps.sort((a, b) => b.durationMinutes - a.durationMinutes);
  const main = sleeps[0] ?? null;
  const naps = sleeps.slice(1);
  return {
    sleep: main ? { ...main, napCount: naps.length, napMinutes: naps.reduce((sum, item) => sum + item.durationMinutes, 0) } : null,
    activities: (["phone", "screen", "gaming"] as const).map((category) => ({ category, durationMinutes: Math.round(totals[category] / 60_000) })),
  };
}
