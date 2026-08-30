"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { chronicleExcerpt } from "@/lib/chronicle";
import type { ApiError, ChronicleEntry, ChronicleSource } from "@/lib/types";

type ChronicleDraft = { date: string; title: string; contentMd: string; source: ChronicleSource };

function emptyDraft(): ChronicleDraft {
  return { date: currentLocalDate(), title: "", contentMd: "", source: "manual" };
}

function sourceLabel(source: ChronicleSource) {
  return source === "chatgpt" ? "ChatGPT" : "Manual";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

async function responseError(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as ApiError | null;
  return result?.error || fallback;
}

export function ChronicleView({ initial }: { initial: ChronicleEntry[] }) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ChronicleDraft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/chronicle?q=${encodeURIComponent(query)}&limit=100`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(await responseError(response, "Could not load Chronicle."));
        setItems(await response.json() as ChronicleEntry[]);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Could not load Chronicle.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function openCreate() {
    setDraft(emptyDraft()); setError(""); setNotice(""); setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/chronicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) { setError(await responseError(response, "Could not create Chronicle entry.")); return; }
      const created = await response.json() as ChronicleEntry;
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setShowForm(false); setDraft(emptyDraft()); setNotice("Chronicle entry saved.");
    } catch {
      setError("Could not create Chronicle entry.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="page chronicle-page">
    <PageHeader eyebrow="ARCHIVE" title="Chronicle" description="Dated Markdown entries, kept in their original words." action={<button className="button primary" onClick={openCreate}><Icon name="plus" />New entry</button>} />

    {notice && <p className="success-banner" role="status">{notice}</p>}
    {showForm && <FormSheet title="Add to Chronicle" onClose={() => { setShowForm(false); setError(""); }} formId="chronicle-create-form" submitLabel="Save entry" busy={saving}><form id="chronicle-create-form" className="editor-card chronicle-editor" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">NEW ENTRY</span><h2>Add to Chronicle</h2></div><button type="button" className="text-button" onClick={() => { setShowForm(false); setError(""); }}>Cancel</button></div>
      <div className="form-grid">
        <label className="field"><span>Date</span><input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label className="field"><span>Source</span><select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as ChronicleSource })}><option value="manual">Manual</option><option value="chatgpt">ChatGPT</option></select></label>
        <label className="field wide"><span>Title</span><input required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field wide"><span>Markdown</span><textarea required rows={12} maxLength={100000} value={draft.contentMd} onChange={(event) => setDraft({ ...draft, contentMd: event.target.value })} placeholder="Write in Markdown…" /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save entry"}</button></div>
    </form></FormSheet>}

    {!showForm && error && <p className="form-error" role="alert">{error}</p>}
    <div className="chronicle-toolbar" aria-busy={loading}>
      <label className="search-box chronicle-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles and entries…" aria-label="Search Chronicle titles and content" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>
      <span className="result-count">{items.length} {items.length === 1 ? "entry" : "entries"}</span>
    </div>

    {items.length ? <div className="chronicle-list" aria-busy={loading}>{items.map((entry) => <Link className="chronicle-row" href={`/chronicle/${entry.id}`} key={entry.id}>
      <time className="chronicle-row-date" dateTime={entry.date}>{dateLabel(entry.date)}</time>
      <span className="chronicle-row-copy"><span className="chronicle-row-heading"><strong>{entry.title}</strong><small>{sourceLabel(entry.source)}</small></span><span className="chronicle-row-excerpt">{chronicleExcerpt(entry.contentMd)}</span></span>
      <Icon name="arrow" />
    </Link>)}</div> : <div className="empty-state chronicle-empty"><span className="empty-icon"><Icon name="chronicle" /></span><h2>{query ? "No matching entries" : "Chronicle is empty"}</h2><p>{query ? "Try a different title or phrase." : "Add a dated Markdown entry to begin."}</p>{!query && <button className="button secondary" onClick={openCreate}><Icon name="plus" />New entry</button>}</div>}
  </div>;
}
