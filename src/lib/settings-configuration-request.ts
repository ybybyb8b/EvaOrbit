// Online preferences only; never grants business CRUD or background replay.
export function allowsSettingsConfiguration(path: string, method: string): boolean {
  if (path === "/api/preferences/life-day") return method === "GET" || method === "PATCH";
  return path === "/api/calendar-interpretation" && (method === "GET" || method === "PUT");
}
