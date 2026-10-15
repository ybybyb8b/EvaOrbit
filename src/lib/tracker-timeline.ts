import { dateInEvaOrbit } from './time.ts';
import type { TrackerField } from './types.ts';

type TimelineRecord = { id: number; occurredAt: string; note: string; values: Record<string, unknown> };

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
  for (const entry of [...entries].sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt) || b.id-a.id)) {
    const date = dateInEvaOrbit(new Date(entry.occurredAt));
    const records = groups.get(date) ?? [];
    records.push(entry);
    groups.set(date, records);
  }
  return Array.from(groups, ([date, entries]) => ({date, entries}));
}
