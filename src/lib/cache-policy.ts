// Data dependencies, not every URL: writes also invalidate derived summaries.
const dependencies: Record<string, string[]> = {
  insights: ["insights", "food", "drinks", "health", "trackers", "tasks"],
  home: ["food", "drinks", "trackers", "health", "calendar", "tasks", "cats", "relations", "subscriptions", "journal", "notifications"],
  "food-drink": ["food", "drinks", "calendar"],
  food: ["food", "calendar"], drinks: ["drinks", "food"], nutrition: ["food", "drinks", "health"],
  health: ["health", "food", "drinks", "calendar", "notifications"],
  cats: ["cats", "notifications"], trackers: ["trackers", "notifications"],
  tasks: ["tasks", "notifications"], notifications: ["notifications", "tasks", "cats", "trackers"],
  memo: ["memo", "memory"], "memory-graph": ["memo", "memory"], memory: ["memory", "memo"],
};
const aliases: Record<string, string> = { "food-drink": "food-drink", reminders: "notifications", "daily-journal": "journal", "calendar-events": "calendar", "calendar-interpretation": "calendar", eventkit: "calendar", healthkit: "health", "project-items": "projects", memos: "memo", memories: "memory", people: "relations" };

export function dataDomain(path: string) {
  if (path.startsWith("/api/preferences/")) return "*";
  const first = path.split("?")[0].replace(/^\/api\//, "/").split("/").filter(Boolean)[0] ?? "home";
  return aliases[first] ?? first;
}

export function dataDependencies(path: string) {
  const domain = dataDomain(path);
  return dependencies[domain] ?? [domain];
}

export function affectsData(path: string, domains: string[]) {
  return domains.includes("*") || dataDependencies(path).some(domain => domains.includes(domain));
}

export function cacheReadPolicy(path: string): { ttl: number } | null {
  const pathname = path.split("?")[0];
  // Never cache auth, native/device state, exports, credentials, or streaming replies.
  if (!/^\/api\/(food(?:\/|$)|food-drink\/home|drinks(?:\/|$)|trackers(?:\/|$)|tasks(?:\/|$)|inbox(?:\/|$)|cats(?:\/|$)|health(?:\/|$)|nutrition(?:\/|$)|projects(?:\/|$)|project-items(?:\/|$)|relations(?:\/|$)|media(?:\/|$)|subscriptions(?:\/|$)|memos(?:\/|$)|memories(?:\/|$)|memory-graph(?:\/|$)|chronicle(?:\/|$)|lucius(?:\/|$)|daily-journal(?:\/|$)|notifications$|reminders(?:\/|$)|ai\/sessions(?:\/|$))/.test(pathname)) return null;
  if (/\/(avatar|photo|cover|icon)$/.test(pathname) || pathname === "/api/notifications") return null;
  return { ttl: /\/(tasks|notifications|reminders)(\/|$)/.test(pathname) ? 15_000 : 60_000 };
}
