"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { memoStatusOptions, memoTypeOptions, optionLabel, parseTagInput } from "@/lib/long-term-memory";
import type { ApiError, Memo, MemoStatus, MemoType } from "@/lib/types";

type Draft = { title: string; content: string; type: MemoType; status: MemoStatus; tags: string; eventDate: string; confirmedAt: string; mergedIntoId: string };
function localDateTime(value: string | null) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function fromMemo(item: Memo): Draft { return { title: item.title, content: item.content, type: item.type, status: item.status, tags: item.tags.join(", "), eventDate: item.eventDate ?? "", confirmedAt: localDateTime(item.confirmedAt), mergedIntoId: item.mergedIntoId?.toString() ?? "" }; }
async function responseError(response: Response, fallback: string) { const result = await response.json().catch(() => null) as ApiError | null; return result?.error || fallback; }

export function MemoDetailView({ initial }: { initial: Memo }) {
  const router = useRouter(); const [item, setItem] = useState(initial); const [draft, setDraft] = useState(() => fromMemo(initial)); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function patch(body: Record<string, unknown>, success: string) { setBusy(true); setError(""); try { const response = await fetch(`/api/memos/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(await responseError(response, "Could not update Memo.")); const updated = await response.json() as Memo; setItem(updated); setDraft(fromMemo(updated)); setEditing(false); setNotice(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update Memo."); } finally { setBusy(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); await patch({ ...draft, tags: parseTagInput(draft.tags), eventDate: draft.eventDate || null, confirmedAt: draft.confirmedAt || null, mergedIntoId: draft.mergedIntoId ? Number(draft.mergedIntoId) : null }, "Memo updated."); }
  async function remove() { if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return; setBusy(true); try { const response = await fetch(`/api/memos/${item.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await responseError(response, "Could not delete Memo.")); router.push("/memo"); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete Memo."); } finally { setBusy(false); } }

  return <div className="page memo-page long-term-detail"><Link className="back-link" href="/memo">← Memo</Link><PageHeader eyebrow={`${optionLabel(memoTypeOptions, item.type)} · ${optionLabel(memoStatusOptions, item.status)}`} title={item.title} description={item.eventDate ? `Event date · ${item.eventDate}` : "Long-term context"} />
    {notice && <p className="success-banner">{notice}</p>}{error && <p className="form-error">{error}</p>}
    {editing ? <form className="editor-card long-term-editor" onSubmit={submit}><div className="form-grid">
      <label className="field wide"><span>Title</span><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="field"><span>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as MemoType })}>{memoTypeOptions.map((value) => <option value={value.value} key={value.value}>{value.label}</option>)}</select></label>
      <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as MemoStatus })}>{memoStatusOptions.map((value) => <option value={value.value} key={value.value}>{value.label}</option>)}</select></label>
      <label className="field"><span>Event date</span><input type="date" value={draft.eventDate} onChange={(event) => setDraft({ ...draft, eventDate: event.target.value })} /></label><label className="field"><span>Confirmed at</span><input type="datetime-local" value={draft.confirmedAt} onChange={(event) => setDraft({ ...draft, confirmedAt: event.target.value })} /></label>
      <label className="field"><span>Merged into ID</span><input type="number" min="1" value={draft.mergedIntoId} onChange={(event) => setDraft({ ...draft, mergedIntoId: event.target.value })} /></label><label className="field"><span>Tags</span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label>
      <label className="field wide"><span>Content</span><textarea required rows={16} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
    </div><div className="form-actions"><button className="button primary" disabled={busy}>Save changes</button><button className="text-button" type="button" onClick={() => { setDraft(fromMemo(item)); setEditing(false); }}>Cancel</button></div></form> : <><article className="long-term-prose">{item.content}</article>{item.tags.length > 0 && <div className="tag-line detail-tags">{item.tags.map((value) => <em key={value}>{value}</em>)}</div>}<dl className="long-term-meta"><div><dt>Confirmed</dt><dd>{item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : "—"}</dd></div><div><dt>Merged into</dt><dd>{item.mergedIntoId ?? "—"}</dd></div><div><dt>Updated</dt><dd>{new Date(item.updatedAt).toLocaleString()}</dd></div></dl><div className="long-term-actions"><button className="button primary" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button>{item.status !== "archived" && <button className="button secondary" disabled={busy} onClick={() => void patch({ status: "archived" }, "Memo archived.")}>Archive</button>}<button className="text-button danger" disabled={busy} onClick={() => void remove()}><Icon name="trash" />Delete</button></div></>}
  </div>;
}
