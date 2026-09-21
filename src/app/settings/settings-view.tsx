"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useLocale } from "@/components/locale-controller";
import { AppearanceThemeSettings } from "./appearance-theme-settings";

export function SettingsView() {
  const { english } = useLocale();

  return <div className="page">
    <PageHeader eyebrow={english ? "APP & APPEARANCE" : "应用与外观"} title={english ? "App & Appearance" : "应用与外观"} action={<Link className="settings-back-link" href="/settings">{english ? "All Settings" : "全部设置"}</Link>} />
    <div className="provider-card"><AppearanceThemeSettings /></div>
  </div>;
}
