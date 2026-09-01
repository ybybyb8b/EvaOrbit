"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { getNativeHostInfo, healthKitSupported, nativeNotificationsSupported } from "@/lib/native-bridge";

type Statuses = { nativeHost: boolean; health: boolean; nativeNotifications: boolean; webNotifications: string };
const initial: Statuses = { nativeHost: false, health: false, nativeNotifications: false, webNotifications: "Checking" };

export function SettingsDirectory() {
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    const refresh = async () => {
      const info = await getNativeHostInfo();
      setStatus({
        nativeHost: Boolean(info),
        health: healthKitSupported(info),
        nativeNotifications: nativeNotificationsSupported(info),
        webNotifications: "Notification" in window ? ({ granted: "Allowed", denied: "Denied", default: "Not requested" } as const)[Notification.permission] : "Unavailable",
      });
    };
    void refresh();
    window.addEventListener("evaorbit:native-ready", refresh);
    return () => window.removeEventListener("evaorbit:native-ready", refresh);
  }, []);

  return <div className="page settings-directory-page">
    <PageHeader eyebrow="SETTINGS" title="Settings" description="Connections, permissions, and the way EvaOrbit feels — organized in one quiet place." />
    <div className="settings-context-strip">
      <span><i className={status.nativeHost ? "online" : ""} />{status.nativeHost ? "Native Host connected" : "Browser session"}</span>
      <span>Private account · RLS</span>
    </div>
    <nav className="settings-directory" aria-label="Settings sections">
      <DirectoryItem href="/settings/app-appearance" icon="settings" eyebrow="APP & APPEARANCE" title="App & Appearance" description="Conversation identity, visual details, and Eva's behavior." meta="Names · avatars · persona" tone="paper" />
      <DirectoryItem href="/settings/ai-connection" icon="ai" eyebrow="AI & CONNECTION" title="AI & Connection" description="Providers, secure API keys, endpoints, and models." meta="Provider · Base URL · Model" tone="linen" />
      <DirectoryItem href="/settings/notifications" icon="notifications" eyebrow="NOTIFICATIONS" title="Notifications" description="Native and Web notification permissions, reminders, routines, and delivery history." meta={status.nativeNotifications ? "Native ready" : `Web ${status.webNotifications.toLowerCase()}`} tone="gold" />
      <DirectoryItem href="/settings/health-native" icon="health" eyebrow="HEALTH & NATIVE" title="Health & Native" description="Apple Health access, energy sync, uploads, and Native Host status." meta={status.health ? "Apple Health available" : status.nativeHost ? "HealthKit unavailable" : "Open in iOS Host to connect"} tone="green" />
      <DirectoryItem href="/settings/data-backup" icon="history" eyebrow="DATA & BACKUP" title="Data & Backup" description="Current storage context and preserved legacy data entry points." meta="Supabase · SQLite fallback" tone="plain" />
    </nav>
  </div>;
}

function DirectoryItem({ href, icon, eyebrow, title, description, meta, tone }: { href: string; icon: IconName; eyebrow: string; title: string; description: string; meta: string; tone: string }) {
  return <Link href={href} className={`settings-directory-item ${tone}`}>
    <span className="settings-directory-icon"><Icon name={icon} /></span>
    <span className="settings-directory-copy"><small>{eyebrow}</small><strong>{title}</strong><span>{description}</span></span>
    <span className="settings-directory-meta">{meta}</span><Icon name="arrow" />
  </Link>;
}
