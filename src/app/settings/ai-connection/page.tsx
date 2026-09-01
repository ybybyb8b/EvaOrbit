import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AiProvidersSettings } from "../ai-providers-settings";

export const metadata: Metadata = { title: "AI & Connection" };

export default function AiConnectionPage() {
  return <div className="page settings-detail-page"><PageHeader eyebrow="AI & CONNECTION" title="AI & Connection" description="Providers, endpoints, secure keys, and the models available to Eva." action={<Link className="settings-back-link" href="/settings">All settings</Link>} /><AiProvidersSettings /></div>;
}
