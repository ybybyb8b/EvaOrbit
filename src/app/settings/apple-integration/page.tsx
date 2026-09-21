import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppleIntegrationSection } from "./section";

export const metadata:Metadata={title:"Apple Integration"};
export default function Page(){return <div className="page settings-detail-page health-native-settings"><PageHeader eyebrow="APPLE INTEGRATION" title="Calendar & Reminders" description="只同步你明确选择的 Apple Calendar 与 Reminder List。" action={<Link className="settings-back-link" href="/settings">全部设置</Link>}/><AppleIntegrationSection/></div>;}
