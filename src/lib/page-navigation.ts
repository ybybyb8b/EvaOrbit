export function isFoodDrinkPath(pathname: string) {
  return ["/food-drink", "/food", "/drinks"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function pageBackFallback(pathname: string) {
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
