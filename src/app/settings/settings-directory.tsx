"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, ChevronRight, Cloud, Cpu, Database, Health, Link2, Notification as NotificationIcon, Palette, Sunrise, type IconComponent } from "reicon-react";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { getNativeHostInfo, healthKitSupported, hostSupports, nativeNotificationsSupported } from "@/lib/native-bridge";
import { useLocale } from "@/components/locale-controller";

type Statuses = { nativeHost: boolean; health: boolean; nativeNotifications: boolean; webNotifications: string };
const initial: Statuses = { nativeHost: false, health: false, nativeNotifications: false, webNotifications: "检查中" };

export function SettingsDirectory({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const { english } = useLocale();
  const local = Boolean(onNavigate);
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    const refresh = async () => {
      const info = await getNativeHostInfo();
      setStatus({
        nativeHost: Boolean(info),
        health: healthKitSupported(info),
        nativeNotifications: nativeNotificationsSupported(info) || local && hostSupports(info, "notification.getStatus"),
        webNotifications: "Notification" in window ? ({ granted: "已允许", denied: "已拒绝", default: "未请求" } as const)[Notification.permission] ?? "未请求" : "不可用",
      });
    };
    void refresh();
    window.addEventListener("evaorbit:native-ready", refresh);
    return () => window.removeEventListener("evaorbit:native-ready", refresh);
  }, [local]);

  return <div className="page settings-directory-page">
    <PageHeader eyebrow={english ? "PREFERENCES & CONNECTIONS" : "偏好与连接"} title={english ? "Settings" : "设置"} />
    <div className="settings-context-strip">
      <span><i className={status.nativeHost ? "online" : ""} />{english ? status.nativeHost ? "Native Host connected" : "Browser session" : status.nativeHost ? "Native Host 已连接" : "浏览器会话"}</span>
    </div>
    <nav className="settings-directory" aria-label="Settings sections">
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/app-appearance") : undefined} href="/settings/app-appearance" icon={Palette} title={english ? "App & Appearance" : "应用与外观"} meta={english ? "Language, type and theme" : "语言、字体与主题"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/life-day") : undefined} href="/settings/life-day" icon={Sunrise} title={english ? "Life day" : "生活日"} meta={english ? "Sleep boundaries and recurring tasks" : "睡眠分界与循环任务归期"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/ai-connection") : undefined} href="/settings/ai-connection" icon={Cpu} title={english ? "AI & Connection" : "AI 与连接"} meta={english ? "Provider, endpoint and model" : "服务商、地址与模型"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/notifications") : undefined} href="/settings/notifications" icon={NotificationIcon} title={english ? "Notifications" : "通知"} meta={english ? status.nativeNotifications ? "Native notifications available" : "Web notifications" : status.nativeNotifications ? "原生通知可用" : `网页通知${status.webNotifications}`} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/health-native") : undefined} href="/settings/health-native" icon={Health} title={english ? "Health & Native" : "健康与原生能力"} meta={english ? status.health ? "Apple Health available" : status.nativeHost ? "HealthKit unavailable" : "Connect through the iOS Host" : status.health ? "Apple Health 可用" : status.nativeHost ? "HealthKit 不可用" : "请在 iOS Host 中连接"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/apple-integration") : undefined} href="/settings/apple-integration" icon={Link2} title={english ? "Apple Integration" : "Apple 日历与提醒事项"} meta={local ? english ? "Calendar and Reminders access" : "日历与提醒事项访问状态" : english ? "Calendar and Reminders sync" : "选择来源并双向同步"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/calendar-interpretation") : undefined} href="/settings/calendar-interpretation" icon={Calendar} title={english ? "Calendar interpretation" : "日历解读"} meta={english ? "Title prefixes, categories and daily summaries" : "标题前缀、分类与每日总结"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/timeline-association") : undefined} href="/settings/timeline-association" icon={Link2} title={english ? "Timeline association rules" : "Timeline 关联规则"} meta={english ? "Combine Calendar and Tracker activities" : "合并展示日历与 Tracker 活动"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/data-sync") : undefined} href="/settings/data-sync" icon={Cloud} title={english ? "Data & Sync" : "数据与同步"} meta={english ? "Module status, offline data and conflicts" : "各板块状态、离线数据与冲突处理"} />
      <DirectoryItem onClick={onNavigate ? () => onNavigate("/settings/data-backup") : undefined} href="/settings/data-backup" icon={Database} title={english ? "Data & Backup" : "数据与备份"} meta={local ? english ? "Account, sync and backups" : "账户、同步与备份" : english ? "Account and cloud backups" : "账户与云端备份"} />
    </nav>
  </div>;
}

export function DirectoryItem({ href, icon: ItemIcon, title, meta, onClick }: { href: string; icon: IconComponent; title: string; meta: string; onClick?:()=>void }) {
  const content=<><span className="settings-directory-icon"><ItemIcon size={21} weight="Outline" /></span>
    <span className="settings-directory-copy"><strong>{title}</strong><span>{meta}</span></span>
    <ChevronRight className="settings-directory-chevron" size={16} weight="Outline" /></>;
  return onClick ? <button type="button" onClick={onClick} className="settings-directory-item">{content}</button> : <Link href={href} className="settings-directory-item">{content}</Link>;
}
