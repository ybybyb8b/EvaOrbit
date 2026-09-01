import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppleHealthSection } from "../../health/apple-health-section";

export const metadata: Metadata = { title: "Health & Native" };

export default function HealthNativePage() {
  return <div className="page settings-detail-page health-native-settings"><PageHeader eyebrow="HEALTH & NATIVE" title="Health & Native" description="Apple Health permission, sync, upload, and the installed Native Host — managed in one place." action={<Link className="settings-back-link" href="/settings">All settings</Link>} /><AppleHealthSection /></div>;
}
