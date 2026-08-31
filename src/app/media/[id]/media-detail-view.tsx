"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { MediaCover } from "@/components/media-cover";
import { PageHeader } from "@/components/page-header";
import type { ApiError, MediaDetail, MediaRating, MediaSeries, MediaStatus, MediaType, MediaViewing } from "@/lib/types";
import { mediaRatings, mediaStatuses, mediaTypes, statusLabel, typeLabel } from "../media-view";

type MediaDraft = { title: string; mediaType: MediaType; status: MediaStatus; rating: MediaRating | ""; isFavorite:boolean; note: string; seriesChoice:string; newSeries:string; seasonNumber:string; seasonTitle:string };

function draftFromDetail(detail: MediaDetail): MediaDraft {
  return { title: detail.title, mediaType: detail.mediaType, status:detail.status, rating: detail.rating ?? "", isFavorite:detail.isFavorite, note: detail.note ?? "", seriesChoice:detail.seriesId?String(detail.seriesId):"", newSeries:"", seasonNumber:detail.seasonNumber?String(detail.seasonNumber):"", seasonTitle:detail.seasonTitle??"" };
}

async function responseError(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as ApiError | null;
  return result?.error || fallback;
}

function viewingLabel(viewing: MediaViewing) {
  return viewing.viewingNumber === 1 ? "First watch" : `Rewatch · ${viewing.viewingNumber - 1}`;
}

export function MediaDetailView({ initial, initialSeries }: { initial: MediaDetail; initialSeries:MediaSeries[] }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MediaDraft>(() => draftFromDetail(initial));
  const [series,setSeries]=useState(initialSeries);
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
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      let seriesId=draft.seriesChoice?Number(draft.seriesChoice):null;
      if(draft.seriesChoice==="__new__"){const seriesResponse=await fetch("/api/media/series",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:draft.newSeries})});if(!seriesResponse.ok){setError(await responseError(seriesResponse,"Could not create series."));return;}const created=await seriesResponse.json() as MediaSeries;seriesId=created.id;setSeries(current=>[...current.filter(item=>item.id!==created.id),created].sort((a,b)=>a.name.localeCompare(b.name)));}
      const response = await fetch(`/api/media/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, mediaType: draft.mediaType, status:draft.status, rating: draft.rating || null, isFavorite:draft.isFavorite, note: draft.note || null, seriesId, seasonNumber:draft.seasonNumber||null, seasonTitle:draft.seasonTitle||null }),
      });
      if (!response.ok) { setError(await responseError(response, "Could not update media.")); return; }
      let next = await response.json() as MediaDetail;
      if(coverFile){const body=new FormData();body.set("file",coverFile);const upload=await fetch(`/api/media/${detail.id}/cover`,{method:"POST",body});if(!upload.ok){setError(await responseError(upload,"Media updated, but its cover could not be uploaded."));return;}const refresh=await fetch(`/api/media/${detail.id}`,{cache:"no-store"});if(refresh.ok)next=await refresh.json() as MediaDetail;}
      setDetail(next); setCoverFile(null); setEditing(false); setNotice("Media updated.");
    } catch { setError("Could not update media."); }
    finally { setBusy(false); }
  }

  async function addRewatch(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/media/${detail.id}/viewings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedDate: rewatchDate }),
      });
      if (!response.ok) { setError(await responseError(response, "Could not add rewatch.")); return; }
      const viewing = await response.json() as MediaViewing;
      setDetail((current) => ({ ...current, status:"completed", viewings: [...current.viewings, viewing].sort((a, b) => a.viewingNumber - b.viewingNumber || a.id - b.id) }));
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
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/media/${detail.id}/viewings/${viewing.id}`, {
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
    if (viewing.viewingNumber === 1) return;
    if (!window.confirm(`Delete ${viewingLabel(viewing).toLowerCase()} on ${viewing.watchedDate}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/media/${detail.id}/viewings/${viewing.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, "Could not delete rewatch.")); return; }
      const refreshed = await fetch(`/api/media/${detail.id}`, { cache: "no-store" });
      if (!refreshed.ok) { setError(await responseError(refreshed, "Could not refresh viewings.")); return; }
      setDetail(await refreshed.json() as MediaDetail); setNotice("Rewatch deleted.");
    } catch { setError("Could not delete rewatch."); }
    finally { setBusy(false); }
  }

  async function removeMedia() {
    if (!window.confirm(`Delete “${detail.title}”? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/media/${detail.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, "Could not delete media.")); return; }
      router.push("/media"); router.refresh();
    } catch { setError("Could not delete media."); }
    finally { setBusy(false); }
  }

  return <div className="page media-page media-detail-page">
    <Link className="back-link media-back-link" href="/media">← Media</Link>
    <PageHeader eyebrow={`${typeLabel(detail.mediaType)} · ${statusLabel(detail.status)}`} title={detail.title} description={detail.seriesName?`${detail.seriesName}${detail.seasonNumber?` · S${detail.seasonNumber}`:""}`:"A single item from your private shelf."} />

    {notice && <p className="success-banner" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    {editing && <FormSheet title="Edit media" onClose={closeEditor} formId="media-edit-form" submitLabel="Save changes" busy={busy}><form id="media-edit-form" className="editor-card media-editor" onSubmit={submitEdit}>
      <div className="editor-title"><div><span className="eyebrow">EDIT MEDIA</span><h2>Edit media</h2></div><button type="button" className="text-button" onClick={closeEditor}>Cancel</button></div>
      <div className="form-grid">
        <label className="media-cover-picker wide"><span className="media-cover-picker-preview"><Icon name="media"/><strong>{coverFile?coverFile.name:detail.coverUrl?"Replace cover":"Choose cover"}</strong><small>JPG, PNG or WebP · up to 4 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setCoverFile(event.target.files?.[0]??null)}/></label>
        <label className="field wide"><span>Title</span><input autoFocus required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Type</span><select value={draft.mediaType} onChange={(event) => {const mediaType=event.target.value as MediaType;setDraft({ ...draft, mediaType,...(!["tv","anime"].includes(mediaType)?{seasonNumber:"",seasonTitle:""}:{}) });}}>{mediaTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Status</span><select value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as MediaStatus})}>{mediaStatuses.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Rating <small>Optional</small></span><select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value as MediaDraft["rating"] })}><option value="">No rating</option>{mediaRatings.map((rating) => <option value={rating} key={rating}>{rating}</option>)}</select></label>
        <label className="field wide"><span>Series / Franchise <small>Optional</small></span><select value={draft.seriesChoice} onChange={event=>setDraft({...draft,seriesChoice:event.target.value})}><option value="">None</option>{series.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}<option value="__new__">Create new series…</option></select></label>
        {draft.seriesChoice==="__new__"&&<label className="field wide"><span>New series name</span><input required maxLength={200} value={draft.newSeries} onChange={event=>setDraft({...draft,newSeries:event.target.value})}/></label>}
        {["tv","anime"].includes(draft.mediaType)&&<><label className="field"><span>Season number <small>Optional</small></span><input type="number" min="1" max="999" value={draft.seasonNumber} onChange={event=>setDraft({...draft,seasonNumber:event.target.value})}/></label><label className="field"><span>Season title <small>Optional</small></span><input maxLength={120} value={draft.seasonTitle} onChange={event=>setDraft({...draft,seasonTitle:event.target.value})}/></label></>}
        <label className="media-favorite-toggle wide"><input type="checkbox" checked={draft.isFavorite} onChange={event=>setDraft({...draft,isFavorite:event.target.checked})}/><span><strong>Favorite</strong><small>Keep it on the Favorites shelf.</small></span></label>
        <label className="field wide"><span>Note <small>Optional</small></span><textarea rows={4} maxLength={5000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>Save changes</button></div>
    </form></FormSheet>}

    {!editing && <section className="media-detail-hero"><MediaCover item={detail}/><dl><div><dt>Type</dt><dd>{typeLabel(detail.mediaType)}</dd></div><div><dt>Status</dt><dd>{statusLabel(detail.status)}</dd></div><div><dt>Series / Franchise</dt><dd>{detail.seriesId?<Link href={`/media/series/${detail.seriesId}`}>{detail.seriesName}</Link>:"None"}</dd></div>{["tv","anime"].includes(detail.mediaType)&&<div><dt>Season</dt><dd>{detail.seasonNumber?`S${detail.seasonNumber}`:"—"}{detail.seasonTitle?` · ${detail.seasonTitle}`:""}</dd></div>}<div><dt>Rating</dt><dd>{detail.rating??"Not rated"}{detail.isFavorite?" · Favorite":""}</dd></div><div><dt>Completed</dt><dd>{detail.viewings[0]?.watchedDate??"Not completed"}</dd></div><div><dt>Rewatches</dt><dd>{Math.max(0,detail.viewings.length-1)}</dd></div></dl></section>}

    {!editing && <section className="media-detail-card">
      <div className="media-detail-section-heading"><span className="eyebrow">VIEWINGS</span><span>{detail.viewings.length} {detail.viewings.length === 1 ? "watch" : "watches"}</span></div>
      <ol className="media-viewings">
        {detail.viewings.map((viewing) => <li key={viewing.id}>
          {editingViewingId === viewing.id ? <FormSheet title="Edit viewing date" onClose={cancelViewingEdit} formId={`media-viewing-${viewing.id}`} submitLabel="Save" busy={busy}><form id={`media-viewing-${viewing.id}`} className="media-viewing-edit" onSubmit={(event) => void saveViewing(event, viewing)}><label className="field"><span>Date</span><input required type="date" value={viewingDate} onChange={(event) => setViewingDate(event.target.value)} /></label><div className="media-viewing-actions"><button className="button primary compact" type="submit" disabled={busy}>Save</button><button className="text-button" type="button" onClick={cancelViewingEdit}>Cancel</button></div></form></FormSheet> : <><div className="media-viewing-copy"><time dateTime={viewing.watchedDate}>{viewing.watchedDate}</time><span>{viewingLabel(viewing)}</span></div><div className="media-viewing-actions"><button className="text-button" type="button" onClick={() => startViewingEdit(viewing)}>Edit date</button>{viewing.viewingNumber > 1 && <button className="text-button danger" type="button" onClick={() => void removeViewing(viewing)} disabled={busy}>Delete</button>}</div></>}
        </li>)}
      </ol>
      {rewatchOpen && <FormSheet title={detail.viewings.length?"Add rewatch":"Add completion"} onClose={() => setRewatchOpen(false)} formId="media-rewatch-form" submitLabel={detail.viewings.length?"Add rewatch":"Add completion"} busy={busy} busyLabel="Adding…"><form id="media-rewatch-form" className="media-rewatch-form" onSubmit={addRewatch}><label className="field"><span>{detail.viewings.length?"Rewatch date":"Completed date"}</span><input required type="date" value={rewatchDate} onChange={(event) => setRewatchDate(event.target.value)} /></label><div className="media-form-actions"><button className="button primary compact" type="submit" disabled={busy}>Save date</button><button className="text-button" type="button" onClick={() => setRewatchOpen(false)}>Cancel</button></div></form></FormSheet>}
    </section>}

    {!editing && <section className="media-note-section"><span className="eyebrow">NOTE</span><p>{detail.note || "No note added."}</p></section>}
    {!editing && <div className="media-detail-actions"><button className="button primary" onClick={startEdit}><Icon name="edit" />Edit</button><button className="button secondary" onClick={() => { setError(""); setNotice(""); setRewatchDate(currentLocalDate()); setRewatchOpen(true); }}><Icon name="plus" />{detail.viewings.length?"Add rewatch":"Add completion"}</button><button className="text-button danger" onClick={() => void removeMedia()} disabled={busy}><Icon name="trash" />Delete</button></div>}
  </div>;
}
