export const HOME_MODULE_IDS = ["inbox", "eva", "trackers", "food", "drinks", "cats", "people", "media", "chronicle", "settings"] as const;

export type HomeModuleId = typeof HOME_MODULE_IDS[number];

export function normalizeHomeModuleOrder(value: unknown): HomeModuleId[] {
  const supplied = Array.isArray(value) ? value.filter((item): item is HomeModuleId => typeof item === "string" && HOME_MODULE_IDS.includes(item as HomeModuleId)) : [];
  return [...new Set(supplied), ...HOME_MODULE_IDS.filter((item) => !supplied.includes(item))];
}
