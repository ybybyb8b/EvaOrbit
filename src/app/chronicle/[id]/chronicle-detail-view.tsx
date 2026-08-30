"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { MarkdownMessage } from "@/components/markdown-message";
import { PageHeader } from "@/components/page-header";
import type { ApiError, ChronicleEntry, ChronicleSource } from "@/lib/types";

type ChronicleDraft = Pick<ChronicleEntry, "date" | "title" | "contentMd" | "source">;

function draftFromEntry(entry: ChronicleEntry): ChronicleDraft {
  return { date: entry.date, title: entry.title, contentMd: entry.contentMd, source: entry.source };
}

function sourceLabel(source: ChronicleSource) {
  return source === "chatgpt" ? "ChatGPT" : "Manual";
}

async function responseError(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as ApiError | null;
  return result?.error || fallback;
}

export function ChronicleDetailView({ initial }: { initial: ChronicleEntry }) {
  const router = useRouter();
  const [entry, setEntry] = useState(initial);
  const [draft, setDraft] = useState<ChronicleDraft>(() => draftFromEntry(initial));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function startEdit() {
    setDraft(draftFromEntry(entry)); setError(""); setNotice(""); setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/chronicle/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!response.ok) { setError(await responseError(response, "Could not update Chronicle entry.")); return; }
      const updated = await response.json() as ChronicleEntry;
      setEntry(updated); setDraft(draftFromEntry(updated)); setEditing(false); setNotice("Chronicle entry updated.");
    } catch {
      setError("Could not update Chronicle entry.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${entry.title}”? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/chronicle/${entry.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, "Could not delete Chronicle entry.")); return; }
      router.push("/chronicle"); router.refresh();
    } catch {
      setError("Could not delete Chronicle entry.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page chronicle-page chronicle-detail-page">
    <Link className="back-link" href="/chronicle">← Chronicle</Link>
    <PageHeader eyebrow={`${entry.date} · ${sourceLabel(entry.source)}`} title={entry.title} description="Full Markdown entry." />
    {notice && <p className="success-banner" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    {editing ? <FormSheet title="Edit Chronicle" onClose={() => { setEditing(false); setDraft(draftFromEntry(entry)); setError(""); }} formId="chronicle-edit-form" submitLabel="Save changes" busy={busy}><form id="chronicle-edit-form" className="editor-card chronicle-editor" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">EDIT ENTRY</span><h2>Edit Chronicle</h2></div><button type="button" className="text-button" onClick={() => { setEditing(false); setDraft(draftFromEntry(entry)); setError(""); }}>Cancel</button></div>
      <div className="form-grid">
        <label className="field"><span>Date</span><input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label className="field"><span>Source</span><select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as ChronicleSource })}><option value="manual">Manual</option><option value="chatgpt">ChatGPT</option></select></label>
        <label className="field wide"><span>Title</span><input required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field wide"><span>Markdown</span><textarea required rows={18} maxLength={100000} value={draft.contentMd} onChange={(event) => setDraft({ ...draft, contentMd: event.target.value })} /></label>
      </div>
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
    </form></FormSheet> : <>
      <article className="chronicle-article"><MarkdownMessage content={entry.contentMd} /></article>
      <div className="chronicle-entry-meta"><span>Created {new Date(entry.createdAt).toLocaleString()}</span><span>Updated {new Date(entry.updatedAt).toLocaleString()}</span></div>
      <div className="chronicle-detail-actions"><button className="button primary" onClick={startEdit}><Icon name="edit" />Edit</button><button className="text-button danger" onClick={() => void remove()} disabled={busy}><Icon name="trash" />Delete</button></div>
    </>}
  </div>;
}
