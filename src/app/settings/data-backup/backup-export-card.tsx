"use client";
import { useUiCopyScope } from "@/components/ui-copy-scope";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-controller";
import { ErrorNotice } from "@/components/error-notice";

const LAST_EXPORT_KEY = "evaorbit:last-backup-exported-at";

export function BackupExportCard({ onExport }: { onExport?: () => Promise<void> } = {}) {
  const { english } = useLocale();
  const storageKey = onExport ? "evaorbit:last-local-tracker-exported-at" : LAST_EXPORT_KEY;
 const copyScope=useUiCopyScope<HTMLElement>();
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "exporting" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setLastExportedAt(window.localStorage.getItem(storageKey)), 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  async function exportBackup() {
    setStatus("exporting");
    setError("");
    try {
      if (onExport) {
        await onExport();
        const exportedAt = new Date().toISOString();
        window.localStorage.setItem(storageKey, exportedAt);
        setLastExportedAt(exportedAt); setStatus("idle"); return;
      }
      const response = await fetch("/api/data-backup/export", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "导出失败");
      }
      const blob = await response.blob();
      const exportedAt = response.headers.get("X-EvaOrbit-Exported-At") ?? new Date().toISOString();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evaorbit-backup-${exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      window.localStorage.setItem(LAST_EXPORT_KEY, exportedAt);
      setLastExportedAt(exportedAt);
      setStatus("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导出失败");
      setStatus("error");
    }
  }

  return <section ref={copyScope} className="backup-export-card">
    <div><span className="eyebrow">PORTABLE BACKUP</span><h2>{onExport ? english ? "Export local Tracker data" : "导出本机 Tracker 数据" : english ? "Export business data" : "导出完整业务数据"}</h2><p>{onExport ? english ? "Includes this account’s original isolated records and editing replica, with both queues. Other modules’ read-only caches are not included." : "包含本账户原有隔离记录、独立编辑副本及两套队列，不包含其他模块的只读缓存。" : english ? "Export cloud business data as JSON for recovery into an independent SQLite database. Keys, credentials and HealthKit data are excluded." : "生成单个 JSON 文件，用于恢复到独立的本地开发 SQLite。导出只读取线上数据，不包含密钥、登录凭证、设备凭证或 HealthKit 数据。"}</p></div>
    <div className="backup-export-actions">
      <span>{lastExportedAt ? `${english ? "Last export: " : "最近导出："}${new Date(lastExportedAt).toLocaleString(english ? "en" : "zh-CN")}` : english ? "Not exported on this device yet" : "尚未在此设备导出"}</span>
      <button className="primary-button" type="button" disabled={status === "exporting"} onClick={exportBackup}>{status === "exporting" ? english ? "Exporting…" : "正在导出…" : "Export backup"}</button>
      {status === "error" ? <ErrorNotice>{error}</ErrorNotice> : null}
    </div>
  </section>;
}
