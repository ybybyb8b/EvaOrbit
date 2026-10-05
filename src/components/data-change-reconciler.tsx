"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeDataChanged } from "@/lib/data-changed";

/** Server-owned Home Due cards; the timeline refetches its own client cache. */
export function DataChangeReconciler() {
  const pathname = usePathname(), router = useRouter();
  useEffect(() => {
    if (pathname !== "/") return;
    return subscribeDataChanged(["tasks", "reminders"], () => router.refresh());
  }, [pathname, router]);
  return null;
}
