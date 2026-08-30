"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError, MediaListItem, MediaRating, MediaType } from "@/lib/types";

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

type MediaDraft = {
  title: string;
  mediaType: MediaType;
  watchedDate: string;
  rating: MediaRating | "";
  note: string;
};

function emptyDraft(): MediaDraft {
  return { title: "", mediaType: "movie", watchedDate: currentLocalDate(), rating: "", note: "" };
}

function typeLabel(value: MediaType) {
  return mediaTypes.find((item) => item.value === value)?.label ?? "Other";
}

async function responseError(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as ApiError | null;
  return result?.error || fallback;
}

export function MediaView({ initial }: { initial: MediaListItem[] }) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<"" | MediaType>("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MediaDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim());
    if (mediaType) params.set("mediaType", mediaType);
    try {
      const response = await fetch(`/api/media?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) { setError(await responseError(response, "Could not load media.")); return; }
      setItems(await response.json() as MediaListItem[]);
    } catch { setError("Could not load media."); }
    finally { setLoading(false); }
  }, [mediaType, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 140);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditingId(null); setDraft(emptyDraft); setError(""); setNotice(""); setShowForm(true);
  }

  function closeEditor() {
    setShowForm(false); setEditingId(null); setDraft(emptyDraft); setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setError(""); setNotice(""); setSaving(true);
    const editing = editingId !== null;
    const body: Record<string, unknown> = {
      title: draft.title,
      mediaType: draft.mediaType,
      rating: draft.rating || null,
      note: draft.note || null,
    };
    if (!editing) body.watchedDate = draft.watchedDate;
    try {
      const response = await fetch(editing ? `/api/media/${editingId}` : "/api/media", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) { setError(await responseError(response, "Could not save media.")); return; }
      closeEditor(); setNotice(editing ? "Media updated." : "Media added."); await load();
    } catch { setError("Could not save media."); }
    finally { setSaving(false); }
  }

  return <div className="page media-page">
    <PageHeader eyebrow="ARCHIVE" title="Media" description="Completed watches, dates, ratings, and rewatch history." action={<button className="button primary" onClick={openCreate}><Icon name="plus" />Add Media</button>} />

    {showForm && <FormSheet title={editingId === null ? "Add media" : "Edit media"} onClose={closeEditor} formId="media-record-form" submitLabel={editingId === null ? "Add media" : "Save changes"} busy={saving}><form id="media-record-form" className="editor-card media-editor" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">{editingId === null ? "NEW MEDIA" : "EDIT MEDIA"}</span><h2>{editingId === null ? "Add media" : "Edit media"}</h2></div><button type="button" className="text-button" onClick={closeEditor}>Cancel</button></div>
      <div className="form-grid">
        <label className="field wide"><span>Title</span><input autoFocus required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Type</span><select value={draft.mediaType} onChange={(event) => setDraft({ ...draft, mediaType: event.target.value as MediaType })}>{mediaTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        {editingId === null && <label className="field"><span>Watched date</span><input required type="date" value={draft.watchedDate} onChange={(event) => setDraft({ ...draft, watchedDate: event.target.value })} /></label>}
        <label className="field"><span>Rating <small>Optional</small></span><select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value as MediaDraft["rating"] })}><option value="">No rating</option>{mediaRatings.map((rating) => <option value={rating} key={rating}>{rating}</option>)}</select></label>
        <label className="field wide"><span>Note <small>Optional</small></span><textarea rows={4} maxLength={5000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit">{editingId === null ? "Add media" : "Save changes"}</button></div>
    </form></FormSheet>}

    {!showForm && error && <p className="form-error">{error}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}

    <div className="media-toolbar" aria-busy={loading}>
      <label className="search-box media-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles…" aria-label="Search media titles" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>
      <span className="result-count">{items.length} {items.length === 1 ? "item" : "items"}</span>
    </div>
    <div className="media-filters" role="group" aria-label="Filter media by type">
      <button type="button" className={!mediaType ? "active" : ""} onClick={() => setMediaType("")}>All</button>
      {mediaTypes.map((item) => <button type="button" className={mediaType === item.value ? "active" : ""} onClick={() => setMediaType(item.value)} key={item.value}>{item.label}</button>)}
    </div>

    {items.length ? <div className="media-list" aria-busy={loading}>{items.map((item) => {
      const rewatchCount = Math.max(0, item.viewingCount - 1);
      return <Link className="media-row" href={`/media/${item.id}`} key={item.id}>
        <span className="media-row-main"><strong>{item.title}</strong><span className="media-row-type">{typeLabel(item.mediaType)}</span></span>
        <span className="media-row-rating">{item.rating ? <span className="media-rating">{item.rating}</span> : <span className="media-muted">No rating</span>}</span>
        <span className="media-row-date"><time dateTime={item.latestWatchedDate}>{item.latestWatchedDate}</time>{rewatchCount > 0 && <small>Rewatched × {rewatchCount}</small>}</span>
        <Icon name="arrow" />
      </Link>;
    })}</div> : <div className="empty-state media-empty"><span className="empty-icon"><Icon name="media" /></span><h2>{query || mediaType ? "No matching media" : "No media recorded"}</h2><p>{query || mediaType ? "Try a different search or filter." : "Add a completed watch to begin."}</p>{!query && !mediaType && <button className="button secondary" onClick={openCreate}><Icon name="plus" />Add Media</button>}</div>}
  </div>;
}
