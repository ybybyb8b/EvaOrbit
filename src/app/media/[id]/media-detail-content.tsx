"use client";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useServerDataState } from "@/components/use-data-refresh";
import { ToastNotice, showActionToast } from "@/components/action-toast";

import {MediaLink as Link,useMediaData} from "@/components/media-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {MediaFields,type MediaDraft,statusLabel,typeLabel} from "@/components/media-fields";
import { FormEvent, useState } from "react";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { MediaCover } from "@/components/media-cover";
import { MediaPageHeader as PageHeader } from "@/components/media-data-context";
import { getMediaDisplayTitle, mediaNameKey } from "@/lib/media-display";
import type { MediaDetail, MediaSeries, MediaViewing } from "@/lib/types";
import { playNativeHaptic } from "@/lib/native-haptics";


function draftFromDetail(detail: MediaDetail): MediaDraft {
  return { originalTitle: detail.originalTitle ?? "", translatedTitle: detail.translatedTitle ?? "", mediaType: detail.mediaType, status:detail.status, rating: detail.rating ?? "", isFavorite:detail.isFavorite, note: detail.note ?? "", seriesChoice:detail.seriesId?String(detail.seriesId):"", newSeries:"",watchedDate:currentLocalDate(), seasonNumber:detail.seasonNumber?String(detail.seasonNumber):"", seasonTitle:detail.seasonTitle??"" };
}


function viewingLabel(viewing: MediaViewing) {
  return viewing.viewingNumber === 1 ? "First watch" : `Rewatch · ${viewing.viewingNumber - 1}`;
}

export function MediaDetailContent({ initial, initialSeries,navigate }: { initial: MediaDetail; initialSeries:MediaSeries[];navigate:(path:string)=>void }) {
  const {read}=useMediaData(),preview=useFormPreview();
  const [detail, setDetail] = useServerDataState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MediaDraft>(() => draftFromDetail(initial));
  const [series,setSeries]=useServerDataState(initialSeries);
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [rewatchOpen, setRewatchOpen] = useState(false);
  const [rewatchDate, setRewatchDate] = useState(currentLocalDate);
  const [editingViewingId, setEditingViewingId] = useState<number | null>(null);
  const [viewingDate, setViewingDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function startEdit() {
    setDraft(draftFromDetail(detail)); setCoverFile(null); setError(""); setNotice(""); setEditing(true);
  }

  function closeEditor() {
    setEditing(false); setDraft(draftFromDetail(detail)); setError("");
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault(); if(preview||busy)return; setBusy(true); setError(""); setNotice("");
    try {
      let seriesId=draft.seriesChoice?Number(draft.seriesChoice):null;
      if(draft.seriesChoice==="__new__"){const seriesResponse=await read("/api/media/series",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:draft.newSeries})});if(!seriesResponse.ok){setError(await responseError(seriesResponse,"Could not create series."));return;}const created=await seriesResponse.json() as MediaSeries;seriesId=created.id;setSeries(current=>[...current.filter(item=>item.id!==created.id),created].sort((a,b)=>a.name.localeCompare(b.name)));}
      const response = await read(`/api/media/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalTitle: draft.originalTitle || null, translatedTitle: draft.translatedTitle || null, mediaType: draft.mediaType, status:draft.status, watchedDate:draft.status==="completed"&&!detail.viewings.length?draft.watchedDate:undefined, rating: draft.rating || null, isFavorite:draft.isFavorite, note: draft.note || null, seriesId, seasonNumber:draft.seasonNumber||null, seasonTitle:draft.seasonTitle||null }),
      });
      if (!response.ok) { setError(await responseError(response, "Could not update media.")); return; }
      let next = await response.json() as MediaDetail;
      if(coverFile){const body=new FormData();body.set("file",coverFile);const upload=await read(`/api/media/${detail.id}/cover`,{method:"POST",body});if(!upload.ok){setDetail(next);setError(await responseError(upload,"Media updated, but its cover could not be uploaded."));return;}const refresh=await read(`/api/media/${detail.id}`,{cache:"no-store"});if(refresh.ok)next=await refresh.json() as MediaDetail;}
      setDetail(next); setCoverFile(null); setEditing(false); setNotice("Media updated.");
    } catch { setError("Could not update media."); }
    finally { setBusy(false); }
  }

  async function addRewatch(event: FormEvent) {
    event.preventDefault(); if(preview||busy)return; setBusy(true); setError(""); setNotice("");
    try {
      const response = await read(`/api/media/${detail.id}/viewings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedDate: rewatchDate }),
      });
      if (!response.ok) { setError(await responseError(response, "Could not add rewatch.")); return; }
      const viewing = await response.json() as MediaViewing;
      setDetail((current) => ({ ...current, status:"completed", viewings: [...current.viewings, viewing].sort((a, b) => a.viewingNumber - b.viewingNumber || a.id - b.id) }));
      playNativeHaptic("success");
      setRewatchOpen(false); setRewatchDate(currentLocalDate()); setNotice("Rewatch added.");
    } catch { setError("Could not add rewatch."); }
    finally { setBusy(false); }
  }

  function startViewingEdit(viewing: MediaViewing) {
    setEditingViewingId(viewing.id); setViewingDate(viewing.watchedDate); setError(""); setNotice("");
  }

  function cancelViewingEdit() {
    setEditingViewingId(null); setViewingDate("");
  }

  async function saveViewing(event: FormEvent, viewing: MediaViewing) {
    event.preventDefault(); if(preview||busy)return; setBusy(true); setError(""); setNotice("");
    try {
      const response = await read(`/api/media/${detail.id}/viewings/${viewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedDate: viewingDate }),
      });
      if (!response.ok) { setError(await responseError(response, "Could not update viewing date.")); return; }
      const next = await response.json() as MediaViewing;
      setDetail((current) => ({ ...current, viewings: current.viewings.map((item) => item.id === next.id ? next : item) }));
      cancelViewingEdit(); setNotice("Viewing date updated.");
    } catch { setError("Could not update viewing date."); }
    finally { setBusy(false); }
  }

  async function removeViewing(viewing: MediaViewing) {
    if (preview||busy||viewing.viewingNumber === 1) return;
    if (!window.confirm(`Delete ${viewingLabel(viewing).toLowerCase()} on ${viewing.watchedDate}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await read(`/api/media/${detail.id}/viewings/${viewing.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, "Could not delete rewatch.")); return; }
      const refreshed = await read(`/api/media/${detail.id}`, { cache: "no-store" });
      if (!refreshed.ok) { setError(await responseError(refreshed, "Could not refresh viewings.")); return; }
      setDetail(await refreshed.json() as MediaDetail); setNotice("Rewatch deleted.");
    } catch { setError("Could not delete rewatch."); }
    finally { setBusy(false); }
  }

  async function removeMedia() {
    if(preview||busy)return;
    if (!window.confirm(`Delete “${getMediaDisplayTitle(detail).primary}”? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await read(`/api/media/${detail.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, "Could not delete media.")); return; }
      showActionToast("Media deleted", "deleted");
      navigate("/media");
    } catch { setError("Could not delete media."); }
    finally { setBusy(false); }
  }

  const displayTitle = getMediaDisplayTitle(detail);
  const primaryKey = mediaNameKey(displayTitle.primary);
  const visibleOriginal = detail.originalTitle && mediaNameKey(detail.originalTitle) !== primaryKey ? detail.originalTitle : null;
  const visibleTranslated = detail.translatedTitle && mediaNameKey(detail.translatedTitle) !== primaryKey && mediaNameKey(detail.translatedTitle) !== mediaNameKey(visibleOriginal) ? detail.translatedTitle : null;
  const seriesRepeatsName = detail.seriesName && [displayTitle.primary, detail.originalTitle, detail.translatedTitle].some((name) => mediaNameKey(name) === mediaNameKey(detail.seriesName));

  return <div className="page media-page media-detail-page">
    <PageHeader eyebrow={`${typeLabel(detail.mediaType)} · ${statusLabel(detail.status)}`} title={displayTitle.primary} description={displayTitle.secondary ?? "A single item from your private shelf."} />

    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    {error && <ErrorNotice role="alert">{error}</ErrorNotice>}

    {editing && <FormSheet title="Edit media" onClose={closeEditor} formId="media-edit-form" submitLabel="Save changes" busy={busy} submitDisabled={preview}><form id="media-edit-form" className="editor-card media-editor" onSubmit={submitEdit}>
      <MediaFields draft={draft} setDraft={setDraft} coverFile={coverFile} setCoverFile={setCoverFile} series={series} needsCompletion={!detail.viewings.length} hasCover={Boolean(detail.coverUrl)}/>
      <div className="form-actions"><button className="button primary" type="submit" disabled={preview||busy}>Save changes</button></div>
    </form></FormSheet>}

    {!editing && <div className="media-detail-actions"><button className="button primary" onClick={startEdit}><Icon name="edit" />Edit</button><button className="button secondary" onClick={() => { setError(""); setNotice(""); setRewatchDate(currentLocalDate()); setRewatchOpen(true); }}><Icon name="plus" />{detail.viewings.length?"Add rewatch":"Add completion"}</button></div>}
    {!editing && <section className="media-detail-hero"><MediaCover item={detail}/><dl>{visibleOriginal&&<div><dt>Original title</dt><dd>{visibleOriginal}</dd></div>}{visibleTranslated&&<div><dt>Translated title</dt><dd>{visibleTranslated}</dd></div>}<div><dt>Type</dt><dd>{typeLabel(detail.mediaType)}</dd></div><div><dt>Status</dt><dd>{statusLabel(detail.status)}</dd></div><div><dt>Series / Franchise</dt><dd>{detail.seriesId?<Link href={`/media/series/${detail.seriesId}`}>{seriesRepeatsName?"Open series":detail.seriesName}</Link>:"None"}</dd></div>{["tv","anime"].includes(detail.mediaType)&&<div><dt>Season</dt><dd>{detail.seasonNumber?`S${detail.seasonNumber}`:"—"}{detail.seasonTitle&&mediaNameKey(detail.seasonTitle)!==mediaNameKey(detail.seriesName)?` · ${detail.seasonTitle}`:""}</dd></div>}<div><dt>Rating</dt><dd>{detail.rating??"Not rated"}{detail.isFavorite?" · Favorite":""}</dd></div><div><dt>Completed</dt><dd>{detail.viewings[0]?.watchedDate??"Not completed"}</dd></div><div><dt>Rewatches</dt><dd>{Math.max(0,detail.viewings.length-1)}</dd></div></dl></section>}

    {!editing && <section className="media-detail-card">
      <div className="media-detail-section-heading"><span className="eyebrow">VIEWINGS</span><span>{detail.viewings.length} {detail.viewings.length === 1 ? "watch" : "watches"}</span></div>
      <ol className="media-viewings">
        {detail.viewings.map((viewing) => <li key={viewing.id}>
          {editingViewingId === viewing.id ? <FormSheet title="Edit viewing date" onClose={cancelViewingEdit} formId={`media-viewing-${viewing.id}`} submitLabel="Save" busy={busy} submitDisabled={preview}><form id={`media-viewing-${viewing.id}`} className="media-viewing-edit" onSubmit={(event) => void saveViewing(event, viewing)}>{preview&&<FormPreviewNotice/>}<label className="field"><span>Date</span><input required type="date" value={viewingDate} onChange={(event) => setViewingDate(event.target.value)} /></label><div className="media-viewing-actions"><button className="button primary compact" type="submit" disabled={preview||busy}>Save</button><button className="text-button" type="button" onClick={cancelViewingEdit}>Cancel</button></div></form></FormSheet> : <><div className="media-viewing-copy"><time dateTime={viewing.watchedDate}>{viewing.watchedDate}</time><span>{viewingLabel(viewing)}</span></div><div className="media-viewing-actions"><button className="text-button" type="button" onClick={() => startViewingEdit(viewing)}>Edit date</button>{viewing.viewingNumber > 1 && <button className="text-button danger" type="button" onClick={() => void removeViewing(viewing)} disabled={preview||busy}>Delete</button>}</div></>}
        </li>)}
      </ol>
      {rewatchOpen && <FormSheet title={detail.viewings.length?"Add rewatch":"Add completion"} onClose={() => setRewatchOpen(false)} formId="media-rewatch-form" submitLabel={detail.viewings.length?"Add rewatch":"Add completion"} busy={busy} submitDisabled={preview} busyLabel="Adding…"><form id="media-rewatch-form" className="media-rewatch-form" onSubmit={addRewatch}>{preview&&<FormPreviewNotice/>}<label className="field"><span>{detail.viewings.length?"Rewatch date":"Completed date"}</span><input required type="date" value={rewatchDate} onChange={(event) => setRewatchDate(event.target.value)} /></label><div className="media-form-actions"><button className="button primary compact" type="submit" disabled={preview||busy}>Save date</button><button className="text-button" type="button" onClick={() => setRewatchOpen(false)}>Cancel</button></div></form></FormSheet>}
    </section>}

    {!editing && <section className="media-note-section"><span className="eyebrow">NOTE</span><p>{detail.note || "No note added."}</p></section>}
    {!editing&&<div className="media-detail-danger"><button className="text-button danger" onClick={() => void removeMedia()} disabled={preview||busy}><Icon name="trash" />Delete</button></div>}
  </div>;
}
