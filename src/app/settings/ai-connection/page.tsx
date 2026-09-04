import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AiProvidersSettings } from "../ai-providers-settings";

export const metadata: Metadata = { title: "AI & Connection" };

export default function AiConnectionPage() {
  return <div className="page settings-detail-page"><PageHeader eyebrow="AI 与连接" title="AI & Connection" description="管理服务商、地址、密钥与模型。" action={<Link className="settings-back-link" href="/settings">全部设置</Link>} /><AiProvidersSettings /></div>;
}
