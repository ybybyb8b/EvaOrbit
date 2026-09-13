"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Cpu, Database, Health, Notification as NotificationIcon, Palette, type IconComponent } from "reicon-react";
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
        webNotifications: "Notification" in window ? ({ granted: "已允许", denied: "已拒绝", default: "未请求" } as const)[Notification.permission] ?? "未请求" : "不可用",
      });
    };
    void refresh();
    window.addEventListener("evaorbit:native-ready", refresh);
    return () => window.removeEventListener("evaorbit:native-ready", refresh);
  }, []);

  return <div className="page settings-directory-page">
    <PageHeader eyebrow={english ? "PREFERENCES & CONNECTIONS" : "偏好与连接"} title={english ? "Settings" : "设置"} />
    <div className="settings-context-strip">
      <span><i className={status.nativeHost ? "online" : ""} />{english ? status.nativeHost ? "Native Host connected" : "Browser session" : status.nativeHost ? "Native Host 已连接" : "浏览器会话"}</span>
    </div>
    <nav className="settings-directory" aria-label="Settings sections">
      <DirectoryItem href="/settings/app-appearance" icon={Palette} title={english ? "App & Appearance" : "应用与外观"} meta={english ? "Language, theme and identity" : "语言、主题与身份"} />
      <DirectoryItem href="/settings/ai-connection" icon={Cpu} title={english ? "AI & Connection" : "AI 与连接"} meta={english ? "Provider, endpoint and model" : "服务商、地址与模型"} />
      <DirectoryItem href="/settings/notifications" icon={NotificationIcon} title={english ? "Notifications" : "通知"} meta={english ? status.nativeNotifications ? "Native notifications available" : "Web notifications" : status.nativeNotifications ? "原生通知可用" : `网页通知${status.webNotifications}`} />
      <DirectoryItem href="/settings/health-native" icon={Health} title={english ? "Health & Native" : "健康与原生能力"} meta={english ? status.health ? "Apple Health available" : status.nativeHost ? "HealthKit unavailable" : "Connect through the iOS Host" : status.health ? "Apple Health 可用" : status.nativeHost ? "HealthKit 不可用" : "请在 iOS Host 中连接"} />
      <DirectoryItem href="/settings/data-backup" icon={Database} title={english ? "Data & Backup" : "数据与备份"} meta={english ? "Supabase with SQLite fallback" : "Supabase 与 SQLite 后备"} />
    </nav>
  </div>;
}

function DirectoryItem({ href, icon: ItemIcon, title, meta }: { href: string; icon: IconComponent; title: string; meta: string }) {
  return <Link href={href} className="settings-directory-item">
    <span className="settings-directory-icon"><ItemIcon size={21} weight="Outline" /></span>
    <span className="settings-directory-copy"><strong>{title}</strong><span>{meta}</span></span>
    <ChevronRight className="settings-directory-chevron" size={16} weight="Outline" />
  </Link>;
}
