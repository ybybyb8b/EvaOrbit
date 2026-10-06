import { matchingCalendarRule, normalizedCalendarPrefix, type CalendarInterpretation } from "./calendar-interpretation.ts";
import { dateInEvaOrbit, zonedDateParts } from "./time.ts";
import type { CalendarEvent, FoodLog, MealType, TimelineEvent } from "./types.ts";

export function calendarMealType(event: CalendarEvent, settings: CalendarInterpretation): MealType | "auto" | null {
  const rule = matchingCalendarRule(event.title, settings, true);
  // An explicit interpretation (including disabled or non-meal rules) wins over title recognition.
  if (rule) return rule.enabled ? rule.mealType ?? null : null;
  const title = normalizedCalendarPrefix(event.title).replace(/^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+/u, "");
  const names: Record<string, MealType | "auto"> = { 早餐: "breakfast", 早饭: "breakfast", 午餐: "lunch", 午饭: "lunch", 晚餐: "dinner", 晚饭: "dinner", 夜宵: "late_night", 加餐: "snack", 吃饭饭: "auto", 吃饭: "auto", 用餐: "auto" };
  const match = title.match(/^(吃饭饭|吃饭|用餐|早餐|早饭|午餐|午饭|晚餐|晚饭|夜宵|加餐)(?=$|\s|[·:：\d])/u);
  return match ? names[match[1]] : null;
}

function usualMeal(hour: number): MealType {
  return hour < 4 || hour >= 22 ? "late_night" : hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner";
}

/** Effective times are derived, never written over the user's original Food timestamps. */
export function resolveMealTimes(foods: FoodLog[], calendar: CalendarEvent[], settings: CalendarInterpretation): FoodLog[] {
  const windows = calendar.flatMap(event => {
    const type = calendarMealType(event, settings), start = Date.parse(event.startAt), end = Date.parse(event.endAt);
    if (!type || event.isAllDay || event.status !== "confirmed" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 4 * 3600_000 || dateInEvaOrbit(new Date(start)) !== dateInEvaOrbit(new Date(end - 1))) return [];
    return [{ event, type, start, end, date: dateInEvaOrbit(new Date(start)), usual: usualMeal(Number(zonedDateParts(event.startAt).time.slice(0, 2))) }];
  });
  const groups = new Map<string, FoodLog[]>();
  for (const food of foods) {
    if (food.calendarTimeEnabled === false) continue;
    const key = `${dateInEvaOrbit(new Date(food.occurredAt))}:${food.mealType}`;
    groups.set(key, [...groups.get(key) ?? [], food]);
  }
  const proposals = [...groups.values()].flatMap(items => {
    const food = items[0], date = dateInEvaOrbit(new Date(food.occurredAt));
    const candidates = windows.flatMap(window => {
      if (window.date !== date || (window.type !== "auto" && window.type !== food.mealType)) return [];
      const timed = items.filter(item => item.occurredHasExplicitTime !== false);
      if (!timed.length && window.type === "auto" && window.usual !== food.mealType) return [];
      const gaps = timed.map(item => { const time = Date.parse(item.occurredAt); return time < window.start ? window.start - time : Math.max(0, time - window.end); });
      // Allow delayed entry, but not an unrelated meal many hours away. Every dish must fit.
      if (timed.some(item => Date.parse(item.occurredAt) < window.start - 30 * 60_000) || gaps.some(gap => gap > 3 * 3600_000)) return [];
      if (window.type === "auto" && window.usual !== food.mealType && (!timed.length || Math.max(...gaps) > 30 * 60_000)) return [];
      return [{ window, score: (gaps.length ? Math.max(...gaps) : 0) + (window.type === "auto" && window.usual !== food.mealType ? 60 * 60_000 : 0) }];
    }).sort((a, b) => a.score - b.score);
    if (!candidates.length || (candidates[1] && candidates[1].score - candidates[0].score < 30 * 60_000)) return [];
    return [{ items, ...candidates[0] }];
  });
  const matches = new Map<number, CalendarEvent>();
  for (const proposal of proposals) {
    const competing = proposals.filter(other => other.window.event.id === proposal.window.event.id).sort((a, b) => a.score - b.score);
    if (competing[0] !== proposal || (competing[1] && competing[1].score - proposal.score < 30 * 60_000)) continue;
    proposal.items.forEach(food => matches.set(food.id, proposal.window.event));
  }
  return foods.map(food => {
    const event = matches.get(food.id);
    return event ? { ...food, originalOccurredAt: food.occurredAt, originalHasExplicitTime: food.occurredHasExplicitTime ?? true, occurredAt: event.startAt, occurredHasExplicitTime: true, calendarMeal: { id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt, notes: event.notes } } : food;
  });
}

export function combineMealTimeline(events: TimelineEvent[]) {
  const matched = new Set(events.flatMap(event => event.sourceType === "food" && event.metadata.calendarMeal ? [(event.metadata.calendarMeal as FoodLog["calendarMeal"])!.id] : []));
  return events.filter(event => event.sourceType !== "calendar" || !matched.has(Number(event.sourceId))).map(event => {
    if (event.sourceType !== "food" || !event.metadata.calendarMeal) return event;
    const meal = event.metadata.calendarMeal as NonNullable<FoodLog["calendarMeal"]>;
    const calendarEvent = events.find(item => item.sourceType === "calendar" && Number(item.sourceId) === meal.id);
    return { ...event, metadata: { ...event.metadata, calendarEvent } };
  });
}
