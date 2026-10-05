"use client";

import { useEffect } from "react";
import { startEventKitAutoSync, syncConfiguredEventKit } from "@/lib/eventkit-auto-sync";
import { reconcileNativeNotifications } from "@/lib/native-bridge";

export function EventKitReconciler() {
  useEffect(() => startEventKitAutoSync(async () => {
    const result = await syncConfiguredEventKit();
    if (result && (result.imported || result.exported || result.merged)) {
      await reconcileNativeNotifications().catch(() => { /* Notification failure must not undo EventKit sync. */ });
    }
  }), []);
  return null;
}
