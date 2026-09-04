"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { getNativeHostInfo, healthKitSupported, nativeNotificationsSupported } from "@/lib/native-bridge";
import { useLocale } from "@/components/locale-controller";

type Statuses = { nativeHost: boolean; health: boolean; nativeNotifications: boolean; webNotifications: string };
const initial: Statuses = { nativeHost: false, health: false, nativeNotifications: false, webNotifications: "检查中" };

export function SettingsDirectory() {
  const { english } = useLocale();
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    const refresh = async () => {
      const info = await getNativeHostInfo();
      setStatus({
        nativeHost: Boolean(info),
        health: healthKitSupported(info),
        nativeNotifications: nativeNotificationsSupported(info),
        webNotifications: "Notification" in window ? ({ granted: "已允许", denied: "已拒绝", default: "未请求" } as const)[Notification.permission] : "不可用",
      });
    };
    void refresh();
    window.addEventListener("evaorbit:native-ready", refresh);
    return () => window.removeEventListener("evaorbit:native-ready", refresh);
  }, []);

  return <div className="page settings-directory-page">
    <PageHeader eyebrow={english ? "SETTINGS" : "设置"} title={english ? "Settings" : "设置"} />
    <div className="settings-context-strip">
      <span><i className={status.nativeHost ? "online" : ""} />{english ? status.nativeHost ? "Native Host connected" : "Browser session" : status.nativeHost ? "Native Host 已连接" : "浏览器会话"}</span>
    </div>
    <nav className="settings-directory" aria-label="Settings sections">
      <DirectoryItem href="/settings/app-appearance" icon="settings" eyebrow={english ? "APP & APPEARANCE" : "应用与外观"} title={english ? "App & Appearance" : "应用与外观"} meta={english ? "Language · Theme · Identity" : "语言 · 主题 · 身份"} tone="paper" />
      <DirectoryItem href="/settings/ai-connection" icon="ai" eyebrow={english ? "AI & CONNECTION" : "AI 与连接"} title={english ? "AI & Connection" : "AI 与连接"} meta={english ? "Provider · Endpoint · Model" : "服务商 · 地址 · 模型"} tone="linen" />
      <DirectoryItem href="/settings/notifications" icon="notifications" eyebrow={english ? "NOTIFICATIONS" : "通知"} title={english ? "Notifications" : "通知"} meta={english ? status.nativeNotifications ? "Native notifications available" : "Web notifications" : status.nativeNotifications ? "原生通知可用" : `网页通知${status.webNotifications}`} tone="gold" />
      <DirectoryItem href="/settings/health-native" icon="health" eyebrow={english ? "HEALTH & NATIVE" : "健康与原生能力"} title={english ? "Health & Native" : "健康与原生能力"} meta={english ? status.health ? "Apple Health available" : status.nativeHost ? "HealthKit unavailable" : "Connect through the iOS Host" : status.health ? "Apple Health 可用" : status.nativeHost ? "HealthKit 不可用" : "请在 iOS Host 中连接"} tone="green" />
      <DirectoryItem href="/settings/data-backup" icon="history" eyebrow={english ? "DATA & BACKUP" : "数据与备份"} title={english ? "Data & Backup" : "数据与备份"} meta={english ? "Supabase · SQLite fallback" : "Supabase · SQLite 后备"} tone="plain" />
    </nav>
  </div>;
}

function DirectoryItem({ href, icon, eyebrow, title, meta, tone }: { href: string; icon: IconName; eyebrow: string; title: string; meta: string; tone: string }) {
  return <Link href={href} className={`settings-directory-item ${tone}`}>
    <span className="settings-directory-icon"><Icon name={icon} /></span>
    <span className="settings-directory-copy"><small>{eyebrow}</small><strong>{title}</strong></span>
    <span className="settings-directory-meta">{meta}</span><Icon name="arrow" />
  </Link>;
}
