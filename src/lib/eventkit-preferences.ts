import { ValidationError } from "./validation.ts";
import type { EventKitModes, EventKitReminderRoutes, EventKitSource, EventKitStatus, EventKitSyncMode } from "./eventkit-sync.ts";

export type SavedEventKitSource = EventKitSource & { kind: "calendar" | "reminder"; mode: EventKitSyncMode };
export type EventKitPreferences = { version: 1; sources: SavedEventKitSource[]; routes: EventKitReminderRoutes };
const domains = ["tasks", "cats", "cat_household", "trackers", "health", "subscriptions"];
export function parseEventKitPreferences(value: unknown): EventKitPreferences {
  if (!value || typeof value !== "object") throw new ValidationError("同步偏好格式不正确");
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.sources) || row.sources.length > 500 || !row.routes || typeof row.routes !== "object" || Array.isArray(row.routes)) throw new ValidationError("同步偏好格式不正确");
  const seen = new Set<string>();
  const sources = row.sources.map((raw): SavedEventKitSource => {
    if (!raw || typeof raw !== "object") throw new ValidationError("同步来源格式不正确");
    const item = raw as Record<string, unknown>;
    if (!["calendar", "reminder"].includes(String(item.kind)) || !["off", "import", "two_way"].includes(String(item.mode)) || typeof item.allowsContentModifications !== "boolean") throw new ValidationError("同步来源格式不正确");
    for (const key of ["identifier", "title", "sourceIdentifier", "sourceTitle"]) if (typeof item[key] !== "string" || String(item[key]).length > 500) throw new ValidationError("同步来源格式不正确");
    if (!item.identifier || seen.has(`${item.kind}:${item.identifier}`)) throw new ValidationError("同步来源重复或缺少标识");
    seen.add(`${item.kind}:${item.identifier}`);
    return { kind: item.kind as SavedEventKitSource["kind"], mode: item.kind === "calendar" && item.mode === "two_way" ? "import" : item.mode as EventKitSyncMode, identifier: String(item.identifier), title: String(item.title), sourceIdentifier: String(item.sourceIdentifier), sourceTitle: String(item.sourceTitle), allowsContentModifications: item.allowsContentModifications };
  });
  const routes: EventKitReminderRoutes = {};
  for (const [domain, id] of Object.entries(row.routes)) {
    if (!domains.includes(domain) || typeof id !== "string" || id.length > 500) throw new ValidationError("Reminder 路由格式不正确");
    if (id && !sources.some(source => source.kind === "reminder" && source.identifier === id)) throw new ValidationError("Reminder 路由来源不存在");
    routes[domain as keyof EventKitReminderRoutes] = id;
  }
  return { version: 1, sources, routes };
}

export function matchEventKitSource(saved: SavedEventKitSource, status: EventKitStatus): EventKitSource | null {
  const items = saved.kind === "calendar" ? status.calendars : status.reminderLists;
  const exact = items.filter(item => item.identifier === saved.identifier);
  if (exact.length === 1) return exact[0];
  const stable = items.filter(item => item.sourceIdentifier === saved.sourceIdentifier && item.title === saved.title);
  if (stable.length === 1) return stable[0];
  const named = items.filter(item => item.sourceTitle === saved.sourceTitle && item.title === saved.title);
  return named.length === 1 ? named[0] : null;
}

export function resolveEventKitPreferences(saved: EventKitPreferences, status: EventKitStatus) {
  const modes: EventKitModes = {}, routes: EventKitReminderRoutes = {}, ids = new Map<string, string>();
  let unresolved = 0;
  const matches = saved.sources.map(source => matchEventKitSource(source, status));
  for (const [index, source] of saved.sources.entries()) {
    const match = matches[index];
    if (!match || matches.filter((candidate, i) => candidate?.identifier === match.identifier && saved.sources[i].kind === source.kind).length !== 1) { if (source.mode !== "off") unresolved++; continue; }
    const mode = source.mode === "two_way" && !match.allowsContentModifications ? "off" : source.mode;
    if (mode !== source.mode) unresolved++;
    modes[match.identifier] = mode;
    if (source.kind === "reminder") ids.set(source.identifier, match.identifier);
  }
  for (const [domain, id] of Object.entries(saved.routes)) {
    const mapped = ids.get(id);
    if (mapped && status.reminderLists.some(item => item.identifier === mapped && item.allowsContentModifications) && modes[mapped] === "two_way") routes[domain as keyof EventKitReminderRoutes] = mapped;
  }
  return { modes, routes, unresolved };
}

export function captureEventKitPreferences(status: EventKitStatus, modes: EventKitModes, routes: EventKitReminderRoutes, previous?: EventKitPreferences, changedSources: string[] = []): EventKitPreferences {
  // Keep unresolved choices (including temporarily revoked scopes) in the account backup.
  const previousMatches = previous?.sources.map(source => matchEventKitSource(source, status)) ?? [];
  const retained = previous?.sources.filter((source, index) => {
    const match = previousMatches[index];
    if (match && changedSources.includes(match.identifier)) return false;
    return !match || previousMatches.filter((candidate, i) => candidate?.identifier === match.identifier && previous.sources[i].kind === source.kind).length > 1 || (source.mode === "two_way" && !match.allowsContentModifications);
  }) ?? [];
  const protectedIds = new Set(retained.map(source => matchEventKitSource(source, status)?.identifier).filter(Boolean));
  const sources: SavedEventKitSource[] = [...retained,
    ...status.calendars.filter(source => !protectedIds.has(source.identifier)).map(source => ({ ...source, kind: "calendar" as const, mode: modes[source.identifier] ?? "off" })),
    ...status.reminderLists.filter(source => !protectedIds.has(source.identifier)).map(source => ({ ...source, kind: "reminder" as const, mode: modes[source.identifier] ?? "off" })),
  ];
  const retainedIds = new Set(retained.filter(source => source.kind === "reminder").map(source => source.identifier));
  const retainedRoutes = Object.fromEntries(Object.entries(previous?.routes ?? {}).filter(([, id]) => retainedIds.has(id)));
  return parseEventKitPreferences({ version: 1, sources, routes: { ...retainedRoutes, ...routes } });
}
