export type StackTracker = { id: string; name: string; lastOccurredAt: string | null; disabled?: boolean };

export function defaultStackIds(trackers: StackTracker[]) {
  return [ /^(poo|便便|排便)$/i, /^(shower|洗澡|洗浴|淋浴)$/i ].flatMap(pattern => {
    const tracker = trackers.find(item => pattern.test(item.name.trim()));
    return tracker ? [tracker.id] : [];
  });
}

export function parseStackIds(value: string | null): string[] | null {
  if (value === null) return null;
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) && ids.every(id => typeof id === "string") ? [...new Set(ids)] : null;
  } catch { return null; }
}
