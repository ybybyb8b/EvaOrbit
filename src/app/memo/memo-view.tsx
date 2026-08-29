"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { memoStatusOptions, memoTypeOptions, optionLabel, parseTagInput, plainExcerpt } from "@/lib/long-term-memory";
import type { ApiError, Memo, MemoStatus, MemoType } from "@/lib/types";

type MemoDraft = { title: string; content: string; type: MemoType; status: MemoStatus; tags: string; eventDate: string; confirmedAt: string };
const emptyDraft = (): MemoDraft => ({ title: "", content: "", type: "note", status: "active", tags: "", eventDate: "", confirmedAt: "" });
async function responseError(response: Response, fallback: string) { const result = await response.json().catch(() => null) as ApiError | null; return result?.error || fallback; }

export function MemoView({ initial }: { initial: Memo[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [type, setType] = useState<"" | MemoType>("");
  const [status, setStatus] = useState<"" | MemoStatus>("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<MemoDraft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const knownTags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim()); if (tag) params.set("tag", tag); if (type) params.set("type", type); if (status) params.set("status", status);
    try { const response = await fetch(`/api/memos?${params}`, { cache: "no-store" }); if (!response.ok) throw new Error(await responseError(response, "Could not load Memo.")); setItems(await response.json() as Memo[]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load Memo."); }
    finally { setLoading(false); }
  }, [query, status, tag, type]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/memos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, tags: parseTagInput(draft.tags), eventDate: draft.eventDate || null, confirmedAt: draft.confirmedAt || null }) });
      if (!response.ok) throw new Error(await responseError(response, "Could not create Memo."));
      const created = await response.json() as Memo; router.push(`/memo/${created.id}`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create Memo."); }
    finally { setSaving(false); }
  }

  return <div className="page memo-page">
    <PageHeader eyebrow="LONG-TERM MEMORY" title="Memo" description="Facts, rules, people, events, and context worth carrying forward." action={<button className="button primary" onClick={() => { setDraft(emptyDraft()); setShowForm(true); }}><Icon name="plus" />New Memo</button>} />
    {showForm && <form className="editor-card long-term-editor" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">NEW MEMO</span><h2>Keep something important</h2></div><button className="text-button" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
      <div className="form-grid">
        <label className="field wide"><span>Title</span><input autoFocus required maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as MemoType })}>{memoTypeOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as MemoStatus })}>{memoStatusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Event date <small>Optional</small></span><input type="date" value={draft.eventDate} onChange={(event) => setDraft({ ...draft, eventDate: event.target.value })} /></label>
        <label className="field"><span>Confirmed at <small>Optional</small></span><input type="datetime-local" value={draft.confirmedAt} onChange={(event) => setDraft({ ...draft, confirmedAt: event.target.value })} /></label>
        <label className="field wide"><span>Tags <small>Comma separated</small></span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="人物, 规则, 长期资料" /></label>
        <label className="field wide"><span>Content</span><textarea required rows={10} maxLength={100000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save Memo"}</button></div>
    </form>}
    {!showForm && error && <p className="form-error" role="alert">{error}</p>}
    <div className="long-term-toolbar" aria-busy={loading}>
      <label className="search-box"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title and content…" aria-label="Search Memo" /></label>
      <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter Memo by tag"><option value="">All tags</option>{knownTags.map((item) => <option value={item} key={item}>{item}</option>)}</select>
      <select value={type} onChange={(event) => setType(event.target.value as "" | MemoType)} aria-label="Filter Memo by type"><option value="">All types</option>{memoTypeOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value as "" | MemoStatus)} aria-label="Filter Memo by status"><option value="">All statuses</option>{memoStatusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>
      <span className="result-count">{items.length}</span>
    </div>
    {items.length ? <div className="memo-list" aria-busy={loading}>{items.map((item) => <Link className="memo-row" href={`/memo/${item.id}`} key={item.id}>
      <span className="memo-row-copy"><span><strong>{item.title}</strong><small>{optionLabel(memoTypeOptions, item.type)} · {optionLabel(memoStatusOptions, item.status)}</small></span><span>{plainExcerpt(item.content)}</span>{item.tags.length > 0 && <span className="tag-line">{item.tags.map((value) => <em key={value}>{value}</em>)}</span>}</span>
      <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString()}</time><Icon name="arrow" />
    </Link>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="memory" /></span><h2>No matching Memo</h2><p>Adjust the filters or keep a new long-term memory.</p></div>}
  </div>;
}
