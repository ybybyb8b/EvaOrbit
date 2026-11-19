export type TrackerOrderId = number | string;
export type TrackerOrder = { groups: string[]; entries: TrackerOrderId[] };
type Item = { id: TrackerOrderId; groupName: string };

export function readTrackerOrder(value: string, localIds = false): TrackerOrder {
  try {
    const parsed = JSON.parse(value);
    return {
      groups: Array.isArray(parsed?.groups) ? [...new Set<string>(parsed.groups.filter((v: unknown) => typeof v === "string"))] : [],
      entries: Array.isArray(parsed?.entries) ? [...new Set<TrackerOrderId>(parsed.entries.filter((id: unknown) =>
        localIds ? typeof id === "string" && id.length > 0 : typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ))] : [],
    };
  } catch { return { groups: [], entries: [] }; }
}

export function orderedTrackerGroups<T extends Item>(items: T[], order: TrackerOrder) {
  const groups = [...new Set(items.map(item => item.groupName))];
  const names = [...order.groups.filter(name => groups.includes(name)), ...groups.filter(name => !order.groups.includes(name))];
  const ranks = new Map(order.entries.map((id, index) => [id, index]));
  return names.map(name => ({ name, items: items.filter(item => item.groupName === name).sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)) }));
}

export function moveTrackerOrder<T>(items: T[], from: T, to: T): T[] {
  const start = items.indexOf(from), end = items.indexOf(to);
  if (start < 0 || end < 0 || start === end) return items;
  const result = [...items];
  result.splice(start, 1); result.splice(end, 0, from);
  return result;
}
