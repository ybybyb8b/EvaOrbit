"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import {NavigationBackControl} from "./navigation-back-control";
import { pageBackFallback } from "@/lib/page-navigation";

export function PageBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const navigating = useRef(false);
  const [pending, startNavigation] = useTransition();
  useEffect(() => { if (!pending) navigating.current = false; }, [pathname, pending]);
  return <NavigationBackControl disabled={pending} onClick={() => {
    if (navigating.current) return;
    navigating.current = true;
    startNavigation(() => {
      if (window.history.state?.evaOrbitCanGoBack) {
        router.back();
      } else {
        window.dispatchEvent(new Event("evaorbit:page-back-fallback"));
        router.replace(pageBackFallback(pathname, window.location.search));
      }
    });
  }}/>;
}
