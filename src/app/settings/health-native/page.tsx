import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppleHealthSection } from "../../health/apple-health-section";

export const metadata: Metadata = { title: "Health & Native" };

export default function HealthNativePage() {
  return <div className="page settings-detail-page health-native-settings"><PageHeader eyebrow="健康与原生能力" title="Health & Native" description="管理 Apple Health 权限、同步与 Native Host。" action={<Link className="settings-back-link" href="/settings">全部设置</Link>} /><AppleHealthSection /></div>;
}
