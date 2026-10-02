"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft2 } from "reicon-react";
import { useLocale } from "./locale-controller";
import { pageBackFallback } from "@/lib/page-navigation";

export function PageBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { english } = useLocale();
  return <button type="button" className="page-back-button" aria-label={english ? "Back to previous page" : "返回上一页"} onClick={() => {
    if (window.history.state?.evaOrbitCanGoBack) router.back();
    else {
      window.dispatchEvent(new Event("evaorbit:page-back-fallback"));
      router.replace(pageBackFallback(pathname));
    }
  }}><ArrowLeft2 size={20} weight="Outline" aria-hidden="true" /><span>{english ? "Back" : "返回"}</span></button>;
}
