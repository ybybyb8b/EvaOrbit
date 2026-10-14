"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { ArrowLeft2 } from "reicon-react";
import { useLocale } from "./locale-controller";
import { pageBackFallback } from "@/lib/page-navigation";

export function PageBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { english } = useLocale();
  const navigating = useRef(false);
  const [pending, startNavigation] = useTransition();
  useEffect(() => { if (!pending) navigating.current = false; }, [pathname, pending]);
  return <button type="button" className="page-back-button" disabled={pending} aria-label={english ? "Back to previous page" : "返回上一页"} onClick={() => {
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
  }}><ArrowLeft2 size={20} weight="Outline" aria-hidden="true" /><span>{english ? "Back" : "返回"}</span></button>;
}
