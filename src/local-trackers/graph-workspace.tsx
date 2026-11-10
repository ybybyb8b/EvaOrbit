import { useEffect, useMemo, useState } from "react";
import { MemoryGraphView } from "@/app/memo/graph/memory-graph-view";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { graphOfflinePath, graphWebUrl, type GraphOfflineSnapshot } from "@/lib/memory-graph-offline";
import { responseError } from "@/lib/response-error";
import type { LocalAccount, TrackerPlatform } from "./platform";

export function GraphWorkspace({ account, platform, factId }: {
  account: LocalAccount; platform: TrackerPlatform; factId?: string;
}) {
  const { english } = useLocale();
  const tr = (en: string, zh: string) => english ? en : zh;
  const [snapshot, setSnapshot] = useState<GraphOfflineSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function read(cacheOnly: boolean) {
      const response = await platform.businessRequest(account, graphOfflinePath, { signal, cacheOnly });
      if (!response.ok) throw new Error(await responseError(response, "Could not download the graph."));
      const data: GraphOfflineSnapshot = await response.json();
      if (!data || !Array.isArray(data.entities) || !Array.isArray(data.facts) || !Array.isArray(data.sources)
        || typeof data.complete !== "boolean" || !Number.isFinite(Date.parse(data.capturedAt))) {
        throw new Error("Invalid graph download.");
      }
      if (!signal.aborted) setSnapshot(data);
      return true;
    }
    async function load() {
      setBusy(true);
      setError("");
      try {
        const cached = await read(true).catch(() => false);
        if (signal.aborted) return;
        if (navigator.onLine) await read(false);
        else if (!cached) setError("offline");
      } catch (reason) {
        if (!signal.aborted) setError(String(reason));
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [account, platform, refresh]);

  const initial = useMemo(() => snapshot && {
    entities: { items: snapshot.entities, has_more: false, next_cursor: null },
    facts: { items: snapshot.facts, has_more: false, next_cursor: null },
    candidates: { items: [], has_more: false, next_cursor: null },
    sourceCount: snapshot.sources.length,
  }, [snapshot]);
  return <>
    <div className="page local-memo-status">
      {snapshot && <p className="chronicle-scope">
        {snapshot.complete ? tr("Downloaded graph", "已下载的图谱") : tr("Partial download", "已下载部分图谱")}
        {" · "}{new Date(snapshot.capturedAt).toLocaleString(english ? "en-GB" : "zh-CN")}
      </p>}
      {busy ? <p role="status">{tr("Loading graph…", "正在载入图谱…")}</p>
        : <button type="button" className="text-button" onClick={() => setRefresh(value => value + 1)}>
          {tr("Refresh graph download", "刷新图谱下载")}
        </button>}
      {error && <ErrorNotice inline>{error === "offline"
        ? tr("Connect to download your graph for offline reading.", "联网下载后，即可离线查看图谱。")
        : error}</ErrorNotice>}
    </div>
    {initial && snapshot ? <MemoryGraphView initial={initial} initialFactId={factId} offline={snapshot}/>
      : !busy && <div className="page"><a href={graphWebUrl} target="_blank" rel="noreferrer">
        {tr("Open Graph on the web", "在网页版打开图谱")}
      </a></div>}
  </>;
}
