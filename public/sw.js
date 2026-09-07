const CACHE = "eva-orbit-static-v7";
const NATIVE_SHELL_CACHE = "eva-orbit-native-shell-v1";
const ICON_NAMES = [
  "calendar", "cats", "chronicle", "drinks", "eva", "food", "health", "home", "inbox", "lucius", "media", "memo", "more", "notifications", "people", "projects", "settings", "trackers",
];
const NAV_ICON_NAMES = ["home", "lucius", "settings"];
const iconAssets = (base = "/icons") => ICON_NAMES.flatMap((name) => [
  `${base}/features/${name}.png`,
  `${base}/features/${name}-dark.png`,
]).concat(NAV_ICON_NAMES.flatMap((name) => [
  `${base}/nav/${name}.png`,
  `${base}/nav/${name}-dark.png`,
]));
const THEMED_ICON_ASSETS = ["rosewood", "powderblue"].flatMap((theme) => iconAssets(`/icons/themes/${theme}`));
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/apple-touch-icon.png",
  "/icons/apple-touch-icon.png",
  ...iconAssets(),
  ...THEMED_ICON_ASSETS,
  "/eva-home-cat.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== NATIVE_SHELL_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_NATIVE_SHELL" || !Array.isArray(event.data.assets)) return;
  const reply = event.ports[0];
  event.waitUntil((async () => {
    try {
      const assets = [...new Set(event.data.assets)].filter((value) => {
        if (typeof value !== "string") return false;
        const url = new URL(value, self.location.origin);
        return url.origin === self.location.origin && (url.pathname === "/native" || url.pathname.startsWith("/_next/static/") || url.pathname === "/theme-init.js");
      });
      if (!assets.includes("/native")) throw new Error("Native shell was not requested");
      const responses = await Promise.all(assets.map(async (asset) => {
        const response = await fetch(new Request(asset, { credentials: "include", cache: "no-store" }));
        if (!response.ok) throw new Error(`Could not cache ${asset}`);
        if (asset === "/native" && (new URL(response.url).pathname !== "/native" || !response.headers.get("content-type")?.includes("text/html"))) throw new Error("Native shell did not return the expected HTML");
        return [asset, response];
      }));
      const cache = await caches.open(NATIVE_SHELL_CACHE);
      await Promise.all(responses.filter(([asset]) => asset !== "/native").map(([asset, response]) => cache.put(asset, response)));
      const shell = responses.find(([asset]) => asset === "/native");
      if (shell) await cache.put(shell[0], shell[1]);
      reply?.postMessage({ ok: true });
    } catch (error) {
      reply?.postMessage({ ok: false });
      throw error;
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && url.pathname === "/native") {
    event.respondWith(caches.open(NATIVE_SHELL_CACHE).then((cache) => cache.match("/native")).then((cached) => cached || fetch(event.request)));
    return;
  }
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
