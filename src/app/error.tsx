"use client";

import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { english } = useLocale();
  const details = error.digest ? `Next.js digest: ${error.digest}` : `${error.name}: ${error.message}`;

  return <div className="page"><div className="empty-state">
    <h1>{english ? "Could not open this page" : "暂时无法打开此页面"}</h1>
    <ErrorNotice inline details={details}>{english ? "Try loading the page again." : "请重新加载页面。"}</ErrorNotice>
    <button type="button" className="button secondary" onClick={retry}>{english ? "Try again" : "重试"}</button>
  </div></div>;
}
