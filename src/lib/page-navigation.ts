export function isFoodDrinkPath(pathname: string) {
  return ["/food-drink", "/food", "/drinks"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function pageBackFallback(pathname: string, search = "") {
  if (pathname === "/health") {
    const query = new URLSearchParams(search);
    const topic = ["sleep", "weight", "training", "energy", "cycle", "records"].includes(query.get("view") ?? "");
    const focused = ["weight", "training"].some(key => {
      const id = Number(query.get(key));
      return Number.isSafeInteger(id) && id > 0;
    });
    if (topic || focused) return "/health";
  }
  const segments = pathname.split("/").filter(Boolean);
  if (pathname === "/food" || pathname === "/drinks" || pathname === "/drinks/history" || pathname === "/food/library" || pathname === "/food/places") return "/food-drink";
  if (segments.length < 2) return "/";
  // Series details belong to the media shelf; there is no series index page.
  if (segments[0] === "media" && segments[1] === "series") return "/media";
  if (segments[0] === "projects" && segments[2] === "items") return `/projects/${segments[1]}`;
  return `/${segments.slice(0, -1).join("/")}`;
}

export function pageNavigationState(state: Record<string, unknown> | null, hasPreviousPage: boolean): Record<string, unknown> & { evaOrbitCanGoBack: boolean } {
  return { ...state, evaOrbitCanGoBack: typeof state?.evaOrbitCanGoBack === "boolean" ? state.evaOrbitCanGoBack : hasPreviousPage };
}

/** Only pages already visited can hold data from before a successful write. */
export function createPageFreshness() {
  const visited = new Set<string>(), stale = new Set<string>();
  return {
    invalidate(affected: (url: string) => boolean = () => true) { for (const url of visited) if (affected(url)) stale.add(url); },
    visit(url: string) {
      visited.add(url);
      return stale.delete(url);
    },
  };
}

export function isAppDataMutation(input: RequestInfo | URL, init: RequestInit | undefined, origin: string) {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  const url = new URL(request?.url ?? String(input), origin);
  const headers = new Headers(init?.headers ?? request?.headers);
  // The EventKit transaction runner publishes only committed business changes,
  // including partial progress on failure. Intermediate writes must not refresh each page.
  if (url.pathname.startsWith("/api/eventkit/") || url.pathname === "/api/preferences/eventkit" ||
      headers.get("x-evaorbit-refresh-owner") === "eventkit" && /^\/api\/(tasks|reminders|calendar-events)(\/|$)/.test(url.pathname)) return false;
  return url.origin === origin && (url.pathname.startsWith("/api/") || headers.has("next-action"));
}
