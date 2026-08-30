import type { DrinkInputSuggestions, DrinkLog } from "./types";

function rankedValues(logs: DrinkLog[], valueFor: (log: DrinkLog) => string, limit = 30) {
  const values = new Map<string, { value: string; count: number; lastUsedAt: string }>();
  for (const log of logs) {
    const value = valueFor(log).trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    const existing = values.get(key);
    if (!existing) values.set(key, { value, count: 1, lastUsedAt: log.occurredAt });
    else {
      existing.count += 1;
      if (log.occurredAt > existing.lastUsedAt) {
        existing.value = value;
        existing.lastUsedAt = log.occurredAt;
      }
    }
  }
  return [...values.values()]
    .sort((left, right) => right.count - left.count || right.lastUsedAt.localeCompare(left.lastUsedAt) || left.value.localeCompare(right.value))
    .slice(0, limit)
    .map((item) => item.value);
}

export function buildDrinkInputSuggestions(logs: DrinkLog[]): DrinkInputSuggestions {
  return { names: rankedValues(logs, (log) => log.name), brands: rankedValues(logs, (log) => log.brand) };
}
