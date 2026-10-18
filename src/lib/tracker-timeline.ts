import { trackerDurationMinutes } from "./tracker-time-range.ts";
import { dateInEvaOrbit } from './time.ts';
import type { TrackerField } from './types.ts';

type TimelineRecord = { id: number | string; occurredAt: string; note: string; values: Record<string, unknown> };

export function orderedTrackerValues(values: Record<string, unknown>, fields: Pick<TrackerField, 'id' | 'key' | 'sortOrder'>[]) {
  const order = new Map(fields.flatMap(field => [[field.key, field.sortOrder], [String(field.id), field.sortOrder]] as [string, number][]));
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0))
    .sort(([a], [b]) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b));
}

export function matchesTrackerSearch(entry: TimelineRecord, query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return true;
  function text(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return Object.values(value).map(text).join(' ');
    return String(value);
  }
  return `${entry.note} ${text(entry.values)}`.toLocaleLowerCase().includes(term);
}

export function groupTrackerTimeline<T extends TimelineRecord>(entries: T[]) {
  const groups = new Map<string, T[]>();
  for (const entry of [...entries].sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt) || (typeof a.id === "number" && typeof b.id === "number" ? b.id-a.id : String(b.id).localeCompare(String(a.id))))) {
    const date = dateInEvaOrbit(new Date(entry.occurredAt));
    const records = groups.get(date) ?? [];
    records.push(entry);
    groups.set(date, records);
  }
  return Array.from(groups, ([date, entries]) => ({date, entries}));
}

export type TimelinePeriod = "all" | "7d" | "30d" | "year";
export function entryMatchesPeriod(entry:Pick<TimelineRecord,"occurredAt"|"values">,period:TimelinePeriod){if(period==="all")return true;const occurred=new Date(entry.occurredAt);const now=new Date();if(period==="year")return occurred.getFullYear()===now.getFullYear();const days=period==="7d"?7:30;return occurred.getTime()>=now.getTime()-days*86400000;}
export function entryMatchesField(entry:Pick<TimelineRecord,"occurredAt"|"values">,field:TrackerField|undefined,filter:string){if(!field||!filter)return true;const value=entry.values[field.key]??entry.values[String(field.id)];if(Array.isArray(value))return value.some((item)=>String(item)===filter);if(field.type==="time_range")return trackerDurationMinutes(value)===Number(filter);if(field.type==="text")return String(value??"").toLocaleLowerCase().includes(filter.toLocaleLowerCase());return String(value??"")===filter;}
