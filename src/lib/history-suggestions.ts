export function buildHistorySuggestions<T>(records: T[], valueFor: (record: T) => string, usedAtFor: (record: T) => string, limit = 30) {
  const values = new Map<string, { value: string; count: number; lastUsedAt: string }>();
  for (const record of records) {
    const value = valueFor(record).trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    const usedAt = usedAtFor(record);
    const existing = values.get(key);
    if (!existing) values.set(key, { value, count: 1, lastUsedAt: usedAt });
    else {
      existing.count += 1;
      if (usedAt > existing.lastUsedAt) {
        existing.value = value;
        existing.lastUsedAt = usedAt;
      }
    }
  }
  return [...values.values()]
    .sort((left, right) => right.count - left.count || right.lastUsedAt.localeCompare(left.lastUsedAt) || left.value.localeCompare(right.value))
    .slice(0, limit)
    .map((item) => item.value);
}
