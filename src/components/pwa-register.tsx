"use client";

import { useEffect } from "react";

function activatedWorker(registration: ServiceWorkerRegistration) {
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) return Promise.reject(new Error("Service Worker is unavailable"));
  if (worker.state === "activated") return Promise.resolve(worker);
  return new Promise<ServiceWorker>((resolve, reject) => {
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve(worker);
      if (worker.state === "redundant") reject(new Error("Service Worker activation failed"));
    });
  });
}

function cacheNativeShell(worker: ServiceWorker, assets: string[]) {
  return new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error("Native shell caching timed out")), 20_000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      if (event.data?.ok) resolve();
      else reject(new Error("Native shell caching failed"));
    };
    worker.postMessage({ type: "CACHE_NATIVE_SHELL", assets }, [channel.port2]);
  });
}

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const shouldCacheNativeShell = window.location.pathname === "/native";
      navigator.serviceWorker.register("/sw.js").then(async (registration) => {
        if (!shouldCacheNativeShell) return;
        const worker = await activatedWorker(registration);
        const assets = new Set<string>(["/native"]);
        document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[rel='stylesheet'][href]").forEach((element) => {
          const value = element instanceof HTMLScriptElement ? element.src : element.href;
          const url = new URL(value, window.location.origin);
          if (url.origin === window.location.origin) assets.add(url.pathname + url.search);
        });
        await cacheNativeShell(worker, [...assets]);
      }).catch(console.error);
    }
  }, []);
  return null;
}
