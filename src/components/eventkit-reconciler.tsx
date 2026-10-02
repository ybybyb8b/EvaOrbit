"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { startEventKitAutoSync, syncConfiguredEventKit } from "@/lib/eventkit-auto-sync";
import { reconcileNativeNotifications } from "@/lib/native-bridge";

export function EventKitReconciler() {
  const router = useRouter();
  useEffect(() => startEventKitAutoSync(async () => {
    const result = await syncConfiguredEventKit();
    if (result && (result.imported || result.merged)) router.refresh();
    if (result && (result.imported || result.exported || result.merged)) {
      await reconcileNativeNotifications().catch(() => { /* Notification failure must not undo EventKit sync. */ });
    }
  }), [router]);
  return null;
}
