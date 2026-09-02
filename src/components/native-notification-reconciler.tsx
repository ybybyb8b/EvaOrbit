"use client";

import { useEffect } from "react";
import { reconcileNativeNotifications } from "@/lib/native-bridge";

export function NativeNotificationReconciler() {
  useEffect(() => {
    const reconcile = () => { void reconcileNativeNotifications().catch(() => { /* Web Push remains the fallback. */ }); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") reconcile(); };
    const initial = window.setTimeout(reconcile, 0);
    window.addEventListener("evaorbit:native-ready", reconcile);
    window.addEventListener("evaorbit:native-active", reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("evaorbit:native-ready", reconcile);
      window.removeEventListener("evaorbit:native-active", reconcile);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return null;
}
