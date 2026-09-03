const CACHE = "eva-orbit-static-v6";
const THEMED_ICON_ASSETS = ["rosewood", "powderblue"].flatMap((theme) => [
  "calendar", "cats", "chronicle", "drinks", "eva", "food", "health", "home", "inbox", "lucius", "media", "memo", "more", "notifications", "people", "projects", "settings", "trackers",
].map((name) => `/icons/themes/${theme}/features/${name}.svg`).concat([
  `/icons/themes/${theme}/features/eva-dark.svg`,
  `/icons/themes/${theme}/features/trackers-dark.svg`,
  `/icons/themes/${theme}/nav/home.svg`,
  `/icons/themes/${theme}/nav/lucius.svg`,
  `/icons/themes/${theme}/nav/settings.svg`,
]));
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/apple-touch-icon.png",
  "/icons/apple-touch-icon.png",
  "/icons/features/calendar.svg",
  "/icons/features/cats.svg",
  "/icons/features/chronicle.svg",
  "/icons/features/drinks.svg",
  "/icons/features/eva.svg",
  "/icons/features/eva-dark.svg",
  "/icons/features/food.svg",
  "/icons/features/health.svg",
  "/icons/features/home.svg",
  "/icons/features/inbox.svg",
  "/icons/features/lucius.svg",
  "/icons/features/media.svg",
  "/icons/features/memo.svg",
  "/icons/features/more.svg",
  "/icons/features/notifications.svg",
  "/icons/features/people.svg",
  "/icons/features/projects.svg",
  "/icons/features/settings.svg",
  "/icons/features/trackers.svg",
  "/icons/features/trackers-dark.svg",
  "/icons/nav/home.svg",
  "/icons/nav/lucius.svg",
  "/icons/nav/settings.svg",
  ...THEMED_ICON_ASSETS,
  "/eva-home-cat.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Private HTML and API responses are never cached. This prevents signed-out
  // users from reopening another session's data through the PWA cache.
  if (event.request.mode === "navigate" || url.pathname.startsWith("/api/")) return;
  if (!url.pathname.startsWith("/_next/static/") && !STATIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }
  const title = typeof payload.title === "string" ? payload.title : "EvaOrbit";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "Due in EvaOrbit",
    icon: "/icons/app-icon-192.png",
    data: { url: typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/" },
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => new URL(client.url).pathname === target);
    return open ? open.focus() : clients.openWindow(target);
  }));
});
