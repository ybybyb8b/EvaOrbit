import {TrackerSyncSettings} from "./tracker-sync-settings";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SettingsDirectory } from "@/app/settings/settings-directory";
import { AppearanceSettings } from "@/components/appearance-settings";
import { AiProvidersSettings } from "@/app/settings/ai-providers-settings";
import { LifeDaySettings } from "@/app/settings/life-day-settings";
import { CalendarInterpretationView } from "@/app/settings/calendar-interpretation/view";
import { AppleIntegrationSection } from "@/app/settings/apple-integration/section";
import { AppleHealthSection } from "@/app/health/apple-health-section";
import { NativeNotificationControl } from "@/components/native-notification-control";
import { BackupExportCard } from "@/app/settings/data-backup/backup-export-card";
import { LocalBackAction } from "./navigation-header";
import { DevelopmentDetails } from "@/components/development-details";
import { ErrorNotice } from "@/components/error-notice";
import { PageHeading } from "@/components/page-heading";
import { PageLoading } from "@/components/page-loading";
import { ReiconAssetContext } from "@/components/reicon-symbol";
import { useLocale } from "@/components/locale-controller";
import { nativeCall } from "@/lib/native-bridge";
import { responseError } from "@/lib/response-error";
import type { CalendarInterpretation } from "@/lib/calendar-interpretation";
import type { CalendarEvent } from "@/lib/types";
import { browserTrackerExport, type LocalAccount, type TrackerPlatform } from "./platform";

export function SettingsWorkspace({ account, platform, onSignIn, onSignOut }: { account: LocalAccount; platform: TrackerPlatform; onSignIn: () => void; onSignOut: () => void }) {
  const { english } = useLocale();
  const [section, setSection] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const request = useCallback((path: RequestInfo | URL, init?: RequestInit) => {
    if (typeof path !== "string") return Promise.reject(new Error("Unsupported settings request"));
    return platform.settingsConfiguration(account, path, init);
  }, [platform, account]);
  const aiRequest = useCallback((path: string, init?: RequestInit) => platform.aiConfiguration(account, path, init), [platform, account]);
  function navigate(path: string) { setError(""); setSection(path); window.scrollTo({ top: 0, behavior: "instant" }); }
  async function exportLocal() {
    if (platform.native) { await nativeCall("trackers.exportState"); return; }
    const state = await browserTrackerExport(account);
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "evaorbit-trackers-local.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const back = <LocalBackAction onBack={section ? () => navigate("") : undefined} />;
  const web = (path: string) => <a className="button secondary" href={`https://eva-orbit.vercel.app${path}`} target="_blank" rel="noreferrer">{english ? "Manage on Web" : "在网页版管理"}</a>;
  const detail = (title: string, children: ReactNode) => <div className="page settings-detail-page local-settings">{back}<PageHeading eyebrow="" title={title} />{children}</div>;
  const nativeNote = <DevelopmentDetails title={english ? "Development version" : "开发版说明"}><p>{english ? "Device status is available here. Health uploads, Calendar/Reminders sync and notification scheduling remain disabled in this development version; existing data and queues are retained." : "此处可查看设备状态；开发版暂不开放健康上传、日历/提醒事项同步和通知排程，保留已有数据和队列。"}</p></DevelopmentDetails>;

  if (section === "/settings/app-appearance") return detail(english ? "App & Appearance" : "应用与外观", <div className="provider-card"><AppearanceSettings localOnly /></div>);
  if (section === "/settings/life-day") return <>{back}<LifeDaySettings request={request} embedded /></>;
  if (section === "/settings/ai-connection") return detail(english ? "AI & Connection" : "AI 与连接", <AiProvidersSettings request={aiRequest} onlineOnly />);
  if (section === "/settings/calendar-interpretation") return <>{back}<LocalCalendarSettings request={request} onAppleIntegration={() => navigate("/settings/apple-integration")} /></>;
  if (section === "/settings/health-native") return detail(english ? "Health & Native" : "健康与原生能力", <><AppleHealthSection readOnly />{nativeNote}</>);
  if (section === "/settings/apple-integration") return detail(english ? "Apple Integration" : "Apple 日历与提醒事项", <><AppleIntegrationSection readOnly />{nativeNote}</>);
  if (section === "/settings/notifications") return detail(english ? "Notifications" : "通知", <><div className="notification-channels"><NativeNotificationControl readOnly /></div><section className="notification-channel"><h2>{english ? "Reminder rules & delivery" : "提醒规则与投递"}</h2><p>{english ? "Manage Bark, browser push, reminder rules and delivery history with your online account." : "Bark、网页推送、提醒规则与投递历史由在线账户管理。"}</p>{web("/settings/notifications")}</section>{nativeNote}</>);
  if (section === "/settings/data-backup") return detail(english ? "Data & Backup" : "数据与备份", <><div className="settings-summary"><section><span>{english ? "Cloud data" : "云端数据"}</span><strong>Supabase Postgres</strong></section><section><span>{english ? "On this device" : "本机存储"}</span><strong>{platform.native ? "SQLite" : "IndexedDB"}</strong></section><section><span>{english ? "Access" : "访问方式"}</span><strong>{english ? "Private account · RLS" : "私人账户 · RLS"}</strong></section></div><BackupExportCard onExport={exportLocal} /><section className="legacy-data-settings"><div><h2>{english ? "Cloud backup & preserved data" : "云端备份与保留数据"}</h2><p>{english ? "Export full cloud business data or access legacy Memory on Web. Local unsynced drafts are included only in the local Tracker export above." : "前往网页版导出完整云端业务数据或访问旧 Memory。未同步本机草稿仅包含在上方的本机 Tracker 导出中。"}</p></div>{web("/settings/data-backup")}</section></>);

  return <>{back}<SettingsDirectory onNavigate={navigate} /><div className="page local-settings local-settings-account">
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <section className="provider-card"><h2>{english ? "Account" : "账户"}</h2><p className="user-content">{account.email}</p><div className="long-term-actions"><button className="button secondary" disabled={busy} onClick={onSignIn}>{english ? "Connect account" : "连接账户"}</button><button className="text-button" disabled={busy} onClick={async () => { if (busy) return; setBusy(true); setError(""); try { await platform.signOut(); onSignOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } }}>{english ? "Sign out" : "退出账户"}</button></div></section>
    <TrackerSyncSettings account={account} platform={platform}/>
  </div></>;
}

function LocalCalendarSettings({ request, onAppleIntegration }: { request: typeof fetch; onAppleIntegration: () => void }) {
  const { english } = useLocale();
  const [data, setData] = useState<{ settings: CalendarInterpretation; records: CalendarEvent[] } | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [iconError, setIconError] = useState("");
  useEffect(() => {
    let active = true;
    request("/api/calendar-interpretation", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not load calendar rules." : "无法读取日历规则。"));
      const value = await response.json(); if (active) { setData(value); setError(""); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    import("virtual:eo-reicon-assets").then(catalog => { if (active) { setAssets(catalog.default); setIconError(""); } }).catch(() => { if (active) setIconError(english ? "Icons could not load. Retry to load the icon catalog." : "图标目录加载失败，请重试。"); });
    return () => { active = false; };
  }, [request, retry, english]);
  if (data) return <ReiconAssetContext.Provider value={assets}>{(error||iconError) && <div className="page"><ErrorNotice inline>{error||iconError}</ErrorNotice><button className="text-button" onClick={() => { setError(""); setIconError(""); setRetry(value => value + 1); }}>{english ? "Retry" : "重试"}</button></div>}<CalendarInterpretationView initialSettings={data.settings} records={data.records} request={request} embedded onAppleIntegration={onAppleIntegration} /></ReiconAssetContext.Provider>;
  return <div className="page settings-detail-page"><PageHeading eyebrow="" title={english ? "Calendar interpretation" : "日历解读"} />{error ? <><ErrorNotice>{error}</ErrorNotice><button className="button secondary" onClick={() => { setError(""); setRetry(value => value + 1); }}>{english ? "Retry" : "重试"}</button></> : <PageLoading title="日历规则" englishTitle="calendar rules" compact />}</div>;
}
