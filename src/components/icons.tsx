export type IconName = "home" | "tasks" | "memory" | "ai" | "settings" | "plus" | "search" | "trash" | "edit" | "check" | "spark" | "history" | "close" | "arrow" | "inbox" | "food" | "drink" | "tracker" | "cats" | "people" | "media" | "chronicle" | "more" | "notifications" | "calendar" | "health";
type IconProps = { name: IconName; variant?: "feature" | "nav" | "stroke" };

const navIconSources: Partial<Record<IconName, string>> = {
  home: "/icons/nav/home.png",
  settings: "/icons/nav/settings.png",
};

const featureIconSources: Partial<Record<IconName, string>> = {
  home: "/icons/features/home.png",
  tasks: "/icons/features/projects.png",
  memory: "/icons/features/memo.png",
  ai: "/icons/features/eva.png",
  settings: "/icons/features/settings.png",
  inbox: "/icons/features/inbox.png",
  food: "/icons/features/food.png",
  drink: "/icons/features/drinks.png",
  tracker: "/icons/features/trackers.png",
  cats: "/icons/features/cats.png",
  people: "/icons/features/people.png",
  media: "/icons/features/media.png",
  chronicle: "/icons/features/chronicle.png",
  more: "/icons/features/more.png",
  notifications: "/icons/features/notifications.png",
  calendar: "/icons/features/calendar.png",
  health: "/icons/features/health.png",
};

const paths: Partial<Record<IconProps["name"], React.ReactNode>> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  tasks: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 8 1.5 1.5L12 7"/><path d="M14 9h3M8 14h9M8 18h6"/></>,
  memory: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 4.5v17M9 6h6"/></>,
  ai: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/><path d="M5 13.5 5.8 16l2.7.8-2.7.8L5 20l-.8-2.4-2.7-.8 2.7-.8z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10z"/><path d="m13.5 7 3.5 3.5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  spark: <><path d="m12 2 1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9z"/><path d="m19 15 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6z"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
  inbox: <><path d="M4 5h16l-1 14H5z"/><path d="M4.5 13h4l2 3h3l2-3h4"/></>,
  food: <><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10"/><path d="M16 3c3 2 3 7 0 9v9M16 3v9"/></>,
  drink: <><path d="M5 4h14l-2 17H7z"/><path d="M8 9h8M14 4l2-3"/></>,
  tracker: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></>,
  cats: <><path d="M5 9 4 3l5 3a9 9 0 0 1 6 0l5-3-1 6a8 8 0 1 1-14 0Z"/><path d="M9 12h.01M15 12h.01M10 16c1.3.8 2.7.8 4 0"/></>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14.5A4.5 4.5 0 0 1 21 19"/></>,
  media: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/></>,
  chronicle: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v18H7.5A2.5 2.5 0 0 0 5 22.5Z"/><path d="M5 4.5v18M9 7h6M9 11h6M9 15h4"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  health: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M7 13h3l1.5-3 2.2 6 1.3-3h2"/></>,
};

export function Icon({ name, variant = "feature" }: IconProps) {
  const featureSource = featureIconSources[name];
  const navSource = navIconSources[name];
  if (navSource && variant === "nav") return <span className="icon nav-icon" style={{ backgroundImage: `url("${navSource}")` }} aria-hidden="true" />;
  if (featureSource && variant === "feature") return <span className="icon feature-icon" style={{ backgroundImage: `url("${featureSource}")` }} aria-hidden="true" />;
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
