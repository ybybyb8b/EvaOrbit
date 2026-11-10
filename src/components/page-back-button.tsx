"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft2 } from "reicon-react";
import { useEffect, useRef, useTransition } from "react";
import {NavigationBackControl} from "./navigation-back-control";
import { pageBackFallback } from "@/lib/page-navigation";

export function PageBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const navigating = useRef(false);
  const [pending, startNavigation] = useTransition();
  useEffect(() => { if (!pending) navigating.current = false; }, [pathname, pending]);
  if (pathname === "/memo/graph") {
    return <Link href="/memo" className="page-back-button"><ArrowLeft2 size={20} weight="Outline" aria-hidden="true"/><span>Echo</span></Link>;
  }
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
