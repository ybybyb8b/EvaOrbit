"use client";

import { ErrorNotice } from "@/components/error-notice";
import Link from "next/link";
import { useLocale } from "@/components/locale-controller";

export default function PreviewError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { english } = useLocale();
  return <div className="page"><div className="empty-state"><h1>{english ? "The ledger couldn’t load" : "暂时无法读取订阅账簿"}</h1><ErrorNotice inline details={error.digest ? `Next.js digest: ${error.digest}` : `${error.name}: ${error.message}`}>{english ? "Try again to load your subscriptions and payment history." : "请重试，重新读取订阅和付款历史。"}</ErrorNotice><button className="button secondary" onClick={retry}>{english ? "Try again" : "重试"}</button><Link className="button secondary" href="/subscriptions">{english ? "Open subscriptions" : "返回订阅页面"}</Link></div></div>;
}
