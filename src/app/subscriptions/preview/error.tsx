"use client";

import Link from "next/link";
import { useLocale } from "@/components/locale-controller";

export default function PreviewError({ reset }: { reset: () => void }) {
  const { english } = useLocale();
  return <div className="page"><div className="empty-state"><h1>{english ? "The ledger couldn’t load" : "暂时无法读取订阅账簿"}</h1><p>{english ? "Try again to load your subscriptions and payment history." : "请重试，重新读取订阅和付款历史。"}</p><button className="button secondary" onClick={reset}>{english ? "Try again" : "重试"}</button><Link className="button secondary" href="/subscriptions">{english ? "Open subscriptions" : "返回订阅页面"}</Link></div></div>;
}
