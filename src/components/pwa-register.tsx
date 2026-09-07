"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then(async (registration) => {
        if (window.location.pathname !== "/native") return;
        await navigator.serviceWorker.ready;
        const assets = new Set<string>(["/native"]);
        document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[rel='stylesheet'][href]").forEach((element) => {
          const value = element instanceof HTMLScriptElement ? element.src : element.href;
          const url = new URL(value, window.location.origin);
          if (url.origin === window.location.origin) assets.add(url.pathname + url.search);
        });
        const worker = registration.active ?? navigator.serviceWorker.controller;
        worker?.postMessage({ type: "CACHE_NATIVE_SHELL", assets: [...assets] });
      }).catch(console.error);
    }
  }, []);
  return null;
}
