"use client";
import { ErrorNotice } from "@/components/error-notice";
import { showActionToast } from "@/components/action-toast";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { useLocale } from "@/components/locale-controller";

import Link from "next/link";
import { responseError } from "@/lib/response-error";
import { TrackerCreateSheet, type TrackerCreateInput } from "./tracker-create-sheet";
import { useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PageLogAction } from "@/components/bottom-log";
import { TrackerIcon } from "@/components/tracker-icon";
import { TrackerCardContent } from "@/components/tracker-card-content";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import type { ApiError, TrackerSummary } from "@/lib/types";
import { orderedTrackerGroups } from "@/lib/tracker-order";
import { TrackerSortSheet, useTrackerOrder } from "./tracker-sort-sheet";
import { Layers } from "reicon-react";

export function TrackersView({ initial, cacheScope }: { initial: TrackerSummary[]; cacheScope: string | null }) {
  const { english } = useLocale();
  const [trackers, setTrackers] = useServerDataState<TrackerSummary[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [order, saveOrder] = useTrackerOrder(cacheScope);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); const response = await fetch("/api/trackers", { cache: "no-store" }); if (response.ok) setTrackers(await response.json()); else setError("Trackers are unavailable right now."); setLoading(false); }, [setTrackers]);
  useDataRefresh("/trackers", () => load());


  async function createTracker({ draft, iconFile, fields }: TrackerCreateInput) {
    const response = await fetch("/api/trackers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    if (!response.ok) throw new Error(await responseError(response, "Could not create the Tracker. Please try again."));
    {
      const tracker = await response.json() as TrackerSummary;
      const followUpErrors: string[] = [];
      if (iconFile) {
        const body = new FormData(); body.set("file", iconFile);
        const upload = await fetch(`/api/trackers/${tracker.id}/icon`, { method: "POST", body });
        if (!upload.ok) followUpErrors.push("its image could not be uploaded");
      }
      for (const [sortOrder, field] of fields.entries()) {
        const fieldResponse = await fetch(`/api/trackers/${tracker.id}/fields`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            name: field.name, type: field.type, options: field.options.split(/[,，]/).map((item) => item.trim()).filter(Boolean), required: field.required,
            includeInStats: field.includeInStats, showAfterQuickCapture: false, unit: field.unit, precision: Number(field.precision), defaultValue: null, sortOrder,
          }),
        });
        if (!fieldResponse.ok) followUpErrors.push(`the property “${field.name}” could not be added`);
      }
      invalidateCachedJson("/api/trackers/quick-log");
      await load();
      if (followUpErrors.length) setError(`Tracker created, but ${followUpErrors.join(" and ")}. You can finish it in Settings.`);
      else showActionToast(english ? "Tracker created." : "观测已创建。");
    }
  }

  async function quickCapture(tracker: TrackerSummary) {
    if (working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/trackers/${tracker.id}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: new Date().toISOString(), values: {}, note: "" }) });
      if (!response.ok) setError(((await response.json()) as ApiError).error); else { await load(); showActionToast(english ? "Record saved." : "记录已保存。"); }
    } catch { setError(english ? "Could not save the record. Please try again." : "记录失败，请重试。"); }
    finally { setWorking(false); }
  }

  const visibleTrackers = trackers.filter(tracker => Boolean(tracker.archivedAt) === showArchived);
  const groups = orderedTrackerGroups(visibleTrackers, order);
  return <div className="page tracker-page">
    <PageHeader eyebrow="生活" title="Trackers" action={<span className="tracker-header-actions">{visibleTrackers.length > 1 && <button type="button" className="text-button tracker-sort-button" disabled={!cacheScope} aria-haspopup="dialog" onClick={() => setShowSort(true)}><Layers size={18} weight="Outline" aria-hidden="true" />{english ? "Sort" : "排序"}</button>}<PageLogAction label="新增观测" onClick={() => setShowForm(true)}><Icon name="plus" />新增观测</PageLogAction></span>} />
    {showSort && <TrackerSortSheet trackers={trackers} archived={showArchived} order={order} onSave={saveOrder} onClose={() => setShowSort(false)} />}
    {trackers.some(tracker=>tracker.archivedAt)&&<div className="tracker-archive-filter"><button className="text-button" aria-pressed={showArchived} onClick={()=>setShowArchived(value=>!value)}>{showArchived?(english?"Back to active Trackers":"返回使用中的 Tracker"):(english?"Archived Trackers":"已归档 Tracker")} · {trackers.filter(tracker=>tracker.archivedAt).length}</button></div>}
    {showForm && <TrackerCreateSheet groupNames={trackers.map(tracker => tracker.groupName)} onClose={() => setShowForm(false)} onCreate={createTracker} />}
    {error && !showForm && <ErrorNotice>{error}</ErrorNotice>}
    {loading ? <PageLoading title="观测" englishTitle="Trackers" inline /> : visibleTrackers.length ? groups.map((group) => <section className="tracker-group" key={group.name}>
      <div className="tracker-group-heading"><h2>{group.name}</h2><span>{group.items.length}</span></div>
      <div className="tracker-card-grid">{group.items.map((tracker) => <article className="tracker-card" key={tracker.id}>
        <Link href={`/trackers/${tracker.id}`}><TrackerCardContent name={tracker.name} lastOccurredAt={tracker.stats.lastOccurredAt} picture={<TrackerIcon tracker={tracker} />} /></Link>
        {tracker.archivedAt ? null : tracker.quickCaptureEnabled ? <button className="tracker-quick" disabled={working} onClick={() => void quickCapture(tracker)} aria-label={`Quick record ${tracker.name}`} title="Quick record"><Icon name="plus" /></button> : <Link className="tracker-quick" href={`/trackers/${tracker.id}?capture=detail`} aria-label={`Add a detailed record to ${tracker.name}`} title="Add detailed record"><Icon name="plus" /></Link>}
      </article>)}</div>
    </section>) : showForm ? null : <div className="empty-state"><span className="empty-icon"><Icon name="tracker" /></span><h2>{showArchived?(english?"No archived Trackers":"暂无已归档 Tracker"):"暂无观测"}</h2><button className="button primary" onClick={() => setShowForm(true)}>新增观测</button></div>}
  </div>;
}
