import { dateInEvaOrbit, dateRange, shiftDate, zonedDateParts } from "./time.ts";
import type { CalendarEvent, TimelineEvent } from "./types.ts";

// Calendar boundaries mix date-only and UTC values; query broadly, then apply
// exclusive overlap rules below so neither all-day nor overnight events are lost.
export function calendarTimelineQuery(range: { from: string; to: string }) {
  return { from: shiftDate(dateInEvaOrbit(new Date(range.from)), -1), to: range.to, limit: 500 };
}

export async function readCalendarTimelineRecords(range: { from: string; to: string }, list: (query: ReturnType<typeof calendarTimelineQuery>) => Promise<CalendarEvent[]>) {
  const records = await list(calendarTimelineQuery(range));
  const first = dateInEvaOrbit(new Date(range.from)), until = dateInEvaOrbit(new Date(range.to));
  if (records.length < 500 || shiftDate(first, 1) === until) return records;
  // ponytail: daily queries avoid the repository's 500-record cap on busy
  // months. More than 500 events in one day needs repository pagination.
  const days: string[] = [];
  for (let date = first; date < until; date = shiftDate(date, 1)) days.push(date);
  const daily = await Promise.all(days.map(date => list(calendarTimelineQuery(dateRange(date)))));
  return [...new Map(daily.flat().map(record => [record.id, record])).values()];
}

export function buildCalendarTimelineEvents(records: CalendarEvent[], range: { from: string; to: string }): TimelineEvent[] {
  const first = dateInEvaOrbit(new Date(range.from)), until = dateInEvaOrbit(new Date(range.to));
  const events: TimelineEvent[] = [];
  for (const record of records) {
    if (record.status === "cancelled") continue;
    const start = record.isAllDay ? dateRange(record.startAt).from : record.startAt;
    const end = record.isAllDay ? dateRange(record.endAt).from : record.endAt;
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) continue;
    for (let date = first; date < until; date = shiftDate(date, 1)) {
      const day = dateRange(date);
      if (Date.parse(end) <= Date.parse(day.from) || Date.parse(start) >= Date.parse(day.to)) continue;
      events.push({
        id: `calendar:${record.id}:${date}`, eventType: "calendar.event", sourceType: "calendar", sourceId: record.id,
        title: record.title, detail: record.location, occurredAt: record.isAllDay ? `${record.startAt}T12:00:00.000Z` : new Date(record.startAt).toISOString(),
        hasExplicitTime: !record.isAllDay, endAt: record.endAt, href: `/#calendar-event-${record.id}`,
        relatedPeople: [], relatedPets: [],
        metadata: { timelineDate: date, startAt: record.startAt, endAt: record.endAt, isAllDay: record.isAllDay, notes: record.notes, location: record.location, timezone: record.timezone, status: record.status },
      });
    }
  }
  return events;
}

export function calendarTimelineRangeLabel(event: TimelineEvent, english: boolean, selectedDate?: string) {
  const start = String(event.metadata.startAt), end = String(event.metadata.endAt);
  if (event.metadata.isAllDay) {
    const last = shiftDate(end, -1);
    return `${english ? "All day" : "全天"} · ${start}${last === start ? "" : ` → ${last}`}`;
  }
  const boundary = (value: string) => {
    const { date, time } = zonedDateParts(value);
    if (date === selectedDate) return time;
    const label = selectedDate && date === shiftDate(selectedDate, -1) ? english ? "Previous day" : "前一日"
      : selectedDate && date === shiftDate(selectedDate, 1) ? english ? "Next day" : "次日" : date;
    return `${label} ${time}`;
  };
  return `${boundary(start)} → ${boundary(end)}`;
}
