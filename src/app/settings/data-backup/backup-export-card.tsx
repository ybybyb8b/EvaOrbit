"use client";

import { useEffect, useState } from "react";

const LAST_EXPORT_KEY = "evaorbit:last-backup-exported-at";

export function BackupExportCard() {
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "exporting" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setLastExportedAt(window.localStorage.getItem(LAST_EXPORT_KEY)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function exportBackup() {
    setStatus("exporting");
    setError("");
    try {
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

  return <section className="backup-export-card">
    <div><span className="eyebrow">PORTABLE BACKUP</span><h2>导出完整业务数据</h2><p>生成单个 JSON 文件，用于恢复到独立的本地开发 SQLite。导出只读取线上数据，不包含密钥、登录凭证、设备凭证或 HealthKit 数据。</p></div>
    <div className="backup-export-actions">
      <span>{lastExportedAt ? `最近导出：${new Date(lastExportedAt).toLocaleString("zh-CN")}` : "尚未在此设备导出"}</span>
      <button className="primary-button" type="button" disabled={status === "exporting"} onClick={exportBackup}>{status === "exporting" ? "正在导出…" : "Export backup"}</button>
      {status === "error" ? <small role="alert">{error}</small> : null}
    </div>
  </section>;
}
