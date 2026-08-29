"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { currentLocalDate } from "@/components/date-time-field";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError, MediaDetail, MediaRating, MediaType, MediaViewing } from "@/lib/types";

const mediaTypes: Array<{ value: MediaType; label: string }> = [
  { value: "movie", label: "Movie" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "documentary", label: "Documentary" },
  { value: "other", label: "Other" },
];

const mediaRatings: MediaRating[] = [
  "goat", "goat+", "goat-", "dope", "dope+", "dope-", "mid", "mid+", "mid-",
  "nope", "nope+", "nope-", "shit", "shit+", "shit-",
];

type MediaDraft = { title: string; mediaType: MediaType; rating: MediaRating | ""; note: string };

function typeLabel(value: MediaType) {
  return mediaTypes.find((item) => item.value === value)?.label ?? "Other";
}

function draftFromDetail(detail: MediaDetail): MediaDraft {
  return { title: detail.title, mediaType: detail.mediaType, rating: detail.rating ?? "", note: detail.note ?? "" };
}

async function responseError(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as ApiError | null;
  return result?.error || fallback;
}

function viewingLabel(viewing: MediaViewing) {
  return viewing.viewingNumber === 1 ? "First watch" : `Rewatch · ${viewing.viewingNumber - 1}`;
}

export function MediaDetailView({ initial }: { initial: MediaDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MediaDraft>(() => draftFromDetail(initial));
  const [rewatchOpen, setRewatchOpen] = useState(false);
  const [rewatchDate, setRewatchDate] = useState(currentLocalDate);
  const [editingViewingId, setEditingViewingId] = useState<number | null>(null);
  const [viewingDate, setViewingDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function startEdit() {
    setDraft(draftFromDetail(detail)); setError(""); setNotice(""); setEditing(true);
  }

  function closeEditor() {
    setEditing(false); setDraft(draftFromDetail(detail)); setError("");
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/media/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, mediaType: draft.mediaType, rating: draft.rating || null, note: draft.note || null }),
      });
      if (!response.ok) { setError(await responseError(response, "Could not update media.")); return; }
      const next = await response.json() as MediaDetail;
      setDetail(next); setEditing(false); setNotice("Media updated.");
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
      setDetail((current) => ({ ...current, viewings: [...current.viewings, viewing].sort((a, b) => a.viewingNumber - b.viewingNumber || a.id - b.id) }));
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
    <PageHeader eyebrow={`${typeLabel(detail.mediaType)}${detail.rating ? ` · ${detail.rating}` : ""}`} title={detail.title} description="Watched dates and rewatch history." />

    {notice && <p className="success-banner" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    {editing && <form className="editor-card media-editor" onSubmit={submitEdit}>
      <div className="editor-title"><div><span className="eyebrow">EDIT MEDIA</span><h2>Edit media</h2></div><button type="button" className="text-button" onClick={closeEditor}>Cancel</button></div>
      <div className="form-grid">
        <label className="field wide"><span>Title</span><input autoFocus required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Type</span><select value={draft.mediaType} onChange={(event) => setDraft({ ...draft, mediaType: event.target.value as MediaType })}>{mediaTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Rating <small>Optional</small></span><select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value as MediaDraft["rating"] })}><option value="">No rating</option>{mediaRatings.map((rating) => <option value={rating} key={rating}>{rating}</option>)}</select></label>
        <label className="field wide"><span>Note <small>Optional</small></span><textarea rows={4} maxLength={5000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>Save changes</button></div>
    </form>}

    {!editing && <section className="media-detail-card">
      <div className="media-detail-section-heading"><span className="eyebrow">VIEWINGS</span><span>{detail.viewings.length} {detail.viewings.length === 1 ? "watch" : "watches"}</span></div>
      <ol className="media-viewings">
        {detail.viewings.map((viewing) => <li key={viewing.id}>
          {editingViewingId === viewing.id ? <form className="media-viewing-edit" onSubmit={(event) => void saveViewing(event, viewing)}><label className="field"><span>Date</span><input required type="date" value={viewingDate} onChange={(event) => setViewingDate(event.target.value)} /></label><div className="media-viewing-actions"><button className="button primary compact" type="submit" disabled={busy}>Save</button><button className="text-button" type="button" onClick={cancelViewingEdit}>Cancel</button></div></form> : <><div className="media-viewing-copy"><time dateTime={viewing.watchedDate}>{viewing.watchedDate}</time><span>{viewingLabel(viewing)}</span></div><div className="media-viewing-actions"><button className="text-button" type="button" onClick={() => startViewingEdit(viewing)}>Edit date</button>{viewing.viewingNumber > 1 && <button className="text-button danger" type="button" onClick={() => void removeViewing(viewing)} disabled={busy}>Delete</button>}</div></>}
        </li>)}
      </ol>
      {rewatchOpen && <form className="media-rewatch-form" onSubmit={addRewatch}><label className="field"><span>Rewatch date</span><input required type="date" value={rewatchDate} onChange={(event) => setRewatchDate(event.target.value)} /></label><div className="media-form-actions"><button className="button primary compact" type="submit" disabled={busy}>Add rewatch</button><button className="text-button" type="button" onClick={() => setRewatchOpen(false)}>Cancel</button></div></form>}
      {!rewatchOpen && <button className="button secondary compact media-add-rewatch" onClick={() => { setError(""); setNotice(""); setRewatchDate(currentLocalDate()); setRewatchOpen(true); }}><Icon name="plus" />Add rewatch</button>}
    </section>}

    {!editing && <section className="media-note-section"><span className="eyebrow">NOTE</span><p>{detail.note || "No note added."}</p></section>}
    {!editing && <div className="media-detail-actions"><button className="button primary" onClick={startEdit}><Icon name="edit" />Edit</button><button className="button secondary" onClick={() => { setError(""); setNotice(""); setRewatchDate(currentLocalDate()); setRewatchOpen(true); }}><Icon name="plus" />Add rewatch</button><button className="text-button danger" onClick={() => void removeMedia()} disabled={busy}><Icon name="trash" />Delete</button></div>}
  </div>;
}
