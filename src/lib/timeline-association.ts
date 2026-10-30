import { normalizedCalendarPrefix } from "./calendar-interpretation.ts";
import { buildCalendarTimelineEvents } from "./calendar-timeline.ts";
import { compareTimelineEvents } from "./timeline.ts";
import { dateInEvaOrbit, dateRange, shiftDate } from "./time.ts";
import type { CalendarEvent, TimelineEvent, Tracker, TrackerEntry } from "./types.ts";

export type TimelineAssociationRule = {
  id: string;
  type: "calendar_tracker";
  name: string;
  enabled: boolean;
  calendarTitle: string;
  titleMatch: "exact" | "prefix";
  trackerId: number;
  timeMatch: "near_end" | "within" | "range";
  toleranceMinutes: number;
};
export type TimelineAssociationSettings = { schemaVersion: 1; revision: number; rules: TimelineAssociationRule[] };
export type TimelineAssociation = { type: "calendar_tracker"; ruleIds: string[]; calendar: CalendarEvent; tracker: Tracker; entry: TrackerEntry };
export const defaultTimelineAssociation = (): TimelineAssociationSettings => ({ schemaVersion: 1, revision: 0, rules: [] });

export function parseTimelineAssociation(value: unknown): TimelineAssociationSettings {
  const object = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Timeline 关联规则格式不正确");
    return input as Record<string, unknown>;
  };
  const text = (input: unknown, max: number) => {
    if (typeof input !== "string" || !input.trim() || input.trim().length > max || /[\u0000-\u001f]/u.test(input)) throw new Error("规则名称或标题格式不正确");
    return input.trim();
  };
  const body = object(value);
  if (body.schemaVersion !== 1 || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) >= Number.MAX_SAFE_INTEGER) throw new Error("关联规则版本不正确");
  if (!Array.isArray(body.rules) || body.rules.length > 200) throw new Error("最多支持 200 条关联规则");
  const rules = body.rules.map(input => {
    const rule = object(input), id = text(rule.id, 80), name = text(rule.name, 80), calendarTitle = text(rule.calendarTitle, 120);
    if (!/^[a-zA-Z0-9_-]+$/u.test(id) || rule.type !== "calendar_tracker" || typeof rule.enabled !== "boolean" || !["exact", "prefix"].includes(String(rule.titleMatch)) || !["near_end", "within", "range"].includes(String(rule.timeMatch)) || !Number.isSafeInteger(rule.trackerId) || Number(rule.trackerId) <= 0 || !Number.isInteger(rule.toleranceMinutes) || Number(rule.toleranceMinutes) < 0 || Number(rule.toleranceMinutes) > 60 || !normalizedCalendarPrefix(calendarTitle)) throw new Error("关联对象或时间条件不正确");
    return { id, type: "calendar_tracker", name, enabled: rule.enabled, calendarTitle, titleMatch: rule.titleMatch, trackerId: rule.trackerId, timeMatch: rule.timeMatch, toleranceMinutes: rule.toleranceMinutes } as TimelineAssociationRule;
  });
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) throw new Error("关联规则 ID 重复");
  return { schemaVersion: 1, revision: Number(body.revision), rules };
}

// A six-hour activity plus at most one-hour tolerance needs less than two
// adjacent days even when checking a competing window on the other side.
export function associationContextRange(range: { from: string; to: string }) {
  return { from: dateRange(shiftDate(dateInEvaOrbit(new Date(range.from)), -2)).from, to: dateRange(shiftDate(dateInEvaOrbit(new Date(range.to)), 2)).from };
}

/** Stable ID cursors, including an empty final page, prove completeness. */
export async function readAssociationPages<T extends { id: number }>(read: (afterId: number, limit: number) => Promise<T[]>): Promise<{ records: T[]; complete: boolean }> {
  const records: T[] = [];
  let cursor = 0;
  // ponytail: bound reads to 10,000 rows per source; fail open to separate
  // Timeline rows rather than guessing uniqueness from a truncated set.
  for (let page = 0; page <= 50; page++) {
    const rows = await read(cursor, 200);
    if (!rows.length) return { records, complete: true };
    if (page === 50 || rows.some((row, index) => !Number.isSafeInteger(row.id) || row.id <= (index ? rows[index - 1].id : cursor))) return { records: [], complete: false };
    records.push(...rows);
    cursor = rows.at(-1)!.id;
  }
  return { records: [], complete: false };
}

const timedInstant = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));

function timeMatches(rule: TimelineAssociationRule, calendar: CalendarEvent, entry: TrackerEntry) {
  const start = Date.parse(calendar.startAt), end = Date.parse(calendar.endAt), point = Date.parse(entry.occurredAt), finish = entry.endAt ? Date.parse(entry.endAt) : point;
  if (!timedInstant(entry.occurredAt) || (entry.endAt && !timedInstant(entry.endAt)) || !Number.isFinite(point) || !Number.isFinite(finish) || finish < point || finish - point > 6 * 3600_000 || (entry.endAt && finish === point) || (entry as TrackerEntry & { occurredHasExplicitTime?: boolean }).occurredHasExplicitTime === false) return false;
  const tolerance = rule.toleranceMinutes * 60_000;
  if (rule.timeMatch === "near_end") return Math.abs(finish - end) <= tolerance;
  if (rule.timeMatch === "within") return point >= start - tolerance && finish <= end + tolerance;
  return Boolean(entry.endAt) && Math.abs(start - point) <= tolerance && Math.abs(end - finish) <= tolerance && Math.max(0, Math.min(end, finish) - Math.max(start, point)) / Math.max(end - start, finish - point) >= 0.8;
}

export function matchTimelineAssociations(settings: TimelineAssociationSettings, calendars: CalendarEvent[], entries: TrackerEntry[], trackers: Tracker[], complete: boolean): TimelineAssociation[] {
  if (!complete) return [];
  const trackerMap = new Map(trackers.map(tracker => [tracker.id, tracker]));
  const pairs = new Map<string, TimelineAssociation>();
  const indexes = new Map<string, Array<{ entry: TrackerEntry; time: number }>>();
  function candidates(rule: TimelineAssociationRule, start: number, end: number) {
    const key = `${rule.trackerId}:${rule.timeMatch === "near_end" ? "end" : "start"}`;
    let index = indexes.get(key);
    if (!index) {
      index = entries.filter(entry => entry.trackerId === rule.trackerId).map(entry => ({ entry, time: Date.parse(rule.timeMatch === "near_end" ? entry.endAt ?? entry.occurredAt : entry.occurredAt) })).filter(item => Number.isFinite(item.time)).sort((a, b) => a.time - b.time);
      indexes.set(key, index);
    }
    const tolerance = rule.toleranceMinutes * 60_000, lower = (rule.timeMatch === "near_end" ? end : start) - tolerance, upper = (rule.timeMatch === "range" ? start : end) + tolerance;
    let left = 0, right = index.length;
    while (left < right) { const middle = (left + right) >>> 1; if (index[middle].time < lower) left = middle + 1; else right = middle; }
    const result: TrackerEntry[] = [];
    for (; left < index.length && index[left].time <= upper; left++) result.push(index[left].entry);
    return result;
  }
  for (const calendar of calendars) {
    const start = Date.parse(calendar.startAt), end = Date.parse(calendar.endAt);
    if (calendar.status !== "confirmed" || calendar.isAllDay || !timedInstant(calendar.startAt) || !timedInstant(calendar.endAt) || end <= start || end - start > 6 * 3600_000) continue;
    for (const rule of settings.rules) {
      const tracker = trackerMap.get(rule.trackerId), title = normalizedCalendarPrefix(calendar.title), expected = normalizedCalendarPrefix(rule.calendarTitle);
      if (!rule.enabled || !tracker || (rule.titleMatch === "exact" ? title !== expected : !title.startsWith(expected))) continue;
      for (const entry of candidates(rule, start, end)) {
        if (entry.trackerId !== tracker.id || !timeMatches(rule, calendar, entry)) continue;
        const key = `${calendar.id}:${entry.id}`, pair = pairs.get(key);
        if (pair) { if (!pair.ruleIds.includes(rule.id)) pair.ruleIds.push(rule.id); }
        else pairs.set(key, { type: "calendar_tracker", ruleIds: [rule.id], calendar, tracker, entry });
      }
    }
  }
  const calendarCounts = new Map<number, number>(), entryCounts = new Map<number, number>();
  for (const pair of pairs.values()) {
    calendarCounts.set(pair.calendar.id, (calendarCounts.get(pair.calendar.id) ?? 0) + 1);
    entryCounts.set(pair.entry.id, (entryCounts.get(pair.entry.id) ?? 0) + 1);
  }
  return [...pairs.values()].filter(pair => calendarCounts.get(pair.calendar.id) === 1 && entryCounts.get(pair.entry.id) === 1).map(pair => ({ ...pair, ruleIds: pair.ruleIds.sort() }));
}

/** Projection only. Each member keeps its complete unmodified source record. */
export function projectTimelineAssociations(events: TimelineEvent[], matches: TimelineAssociation[], range: { from: string; to: string }): TimelineEvent[] {
  if (!matches.length) return events;
  const calendarIds = new Set(matches.map(pair => pair.calendar.id)), entryIds = new Set(matches.map(pair => pair.entry.id));
  const output = events.filter(event => !(event.sourceType === "calendar" && calendarIds.has(Number(event.sourceId))) && !(event.sourceType === "tracker" && entryIds.has(Number(event.sourceId))));
  for (const association of matches) {
    const { calendar, entry } = association;
    const slices = buildCalendarTimelineEvents([calendar], range);
    const entryDay = dateInEvaOrbit(new Date(entry.occurredAt));
    // Keep an entry just after midnight discoverable on its original date,
    // including an exclusive Calendar end at midnight.
    if (Date.parse(entry.occurredAt) >= Date.parse(range.from) && Date.parse(entry.occurredAt) < Date.parse(range.to) && !slices.some(slice => slice.metadata.timelineDate === entryDay)) {
      const slice = buildCalendarTimelineEvents([calendar], { from: calendar.startAt, to: new Date(Date.parse(calendar.endAt) + 86_400_000).toISOString() })[0];
      if (slice) slices.push({ ...slice, metadata: { ...slice.metadata, timelineDate: entryDay } });
    }
    for (const slice of slices) output.push({ ...slice, id: `association:calendar:${calendar.id}:tracker_entry:${entry.id}:${slice.metadata.timelineDate}`, association });
  }
  return output.sort(compareTimelineEvents);
}
