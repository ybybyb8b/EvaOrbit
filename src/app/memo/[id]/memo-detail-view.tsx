"use client";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useServerDataState } from "@/components/use-data-refresh";
import {MemoEditor,type MemoDraft} from "../memo-editor";
import {useMemoData} from "@/components/memo-data-context";
import {useFormPreview} from "@/components/form-preview";
import { SearchableSelect } from "@/components/searchable-select";
import { useFormHistory, historyValues } from "@/components/use-form-history";
import { ToastNotice, showActionToast } from "@/components/action-toast";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { memoStatusOptions, memoTypeOptions, optionLabel, parseTagInput } from "@/lib/long-term-memory";
import type { Memo } from "@/lib/types";

type Draft=MemoDraft;
function localDateTime(value: string | null) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function fromMemo(item: Memo): Draft { return { title: item.title, content: item.content, type: item.type, status: item.status, tags: item.tags.join(", "), eventDate: item.eventDate ?? "", confirmedAt: localDateTime(item.confirmedAt), mergedIntoId: item.mergedIntoId?.toString() ?? "" }; }

export function MemoDetailView({ initial }: { initial: Memo }) {
  const router = useRouter();
  return <MemoDetailContent initial={initial} onDeleted={()=>{router.push("/memo");router.refresh();}}/>;
}
export function MemoDetailContent({initial,onDeleted}:{initial:Memo;onDeleted:()=>void}){
  const readonly=useFormPreview(),{read}=useMemoData();
  const [mergeQuery,setMergeQuery] = useState("");
  const mergeHistory = useFormHistory(`/api/memos?limit=200&q=${encodeURIComponent(mergeQuery)}`,undefined,read);
  const tagHistory = useFormHistory("/api/memos?limit=200",undefined,read); const [item, setItem] = useServerDataState(initial); const [draft, setDraft] = useState(() => fromMemo(initial)); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function patch(body: Record<string, unknown>, success: string) { if(readonly)return; setBusy(true); setError(""); try { const response = await fetch(`/api/memos/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(await responseError(response, "Could not update Memo.")); const updated = await response.json() as Memo; setItem(updated); setDraft(fromMemo(updated)); setEditing(false); setNotice(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update Memo."); } finally { setBusy(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); await patch({ ...draft, tags: parseTagInput(draft.tags), eventDate: draft.eventDate || null, confirmedAt: draft.confirmedAt || null, mergedIntoId: draft.mergedIntoId ? Number(draft.mergedIntoId) : null }, "Memo updated."); }
  async function remove() { if(readonly)return; if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return; setBusy(true); try { const response = await fetch(`/api/memos/${item.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await responseError(response, "Could not delete Memo.")); showActionToast("Memo deleted", "deleted"); onDeleted(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete Memo."); } finally { setBusy(false); } }

  return <div className="page memo-page long-term-detail"><PageHeader eyebrow={`${optionLabel(memoTypeOptions, item.type)} · ${optionLabel(memoStatusOptions, item.status)}`} title={item.title} description={item.eventDate ? `Event date · ${item.eventDate}` : "Long-term context"} />
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}{error && <ErrorNotice>{error}</ErrorNotice>}
    {editing ? <FormSheet title="Edit Memo" onClose={() => { setDraft(fromMemo(item)); setEditing(false); }} formId="memo-edit-form" submitLabel="Save changes" busy={busy} submitDisabled={readonly}><form id="memo-edit-form" className="editor-card long-term-editor" onSubmit={submit}><MemoEditor draft={draft} onChange={setDraft} knownTags={[...item.tags,...historyValues(tagHistory,"tags")]} mergeControl={<div className="field"><span>Merge into Memo</span><SearchableSelect label="合并目标 Memo" value={draft.mergedIntoId} options={[{value:"",label:"None"}, ...(draft.mergedIntoId && !mergeHistory.some(memo=>String(memo.id)===draft.mergedIntoId)?[{value:draft.mergedIntoId,label:`Memo #${draft.mergedIntoId}`}]:[]), ...mergeHistory.filter(memo=>memo.id!==item.id).map(memo=>({value:String(memo.id),label:String(memo.title)}))]} onSearch={setMergeQuery} onValueChange={mergedIntoId=>setDraft({...draft,mergedIntoId})}/></div>}/></form></FormSheet> : <><article className="long-term-prose">{item.content}</article>{item.tags.length > 0 && <div className="tag-line detail-tags">{item.tags.map((value) => <em key={value}>{value}</em>)}</div>}<dl className="long-term-meta"><div><dt>Confirmed</dt><dd>{item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : "—"}</dd></div><div><dt>Merged into</dt><dd>{item.mergedIntoId ?? "—"}</dd></div><div><dt>Updated</dt><dd>{new Date(item.updatedAt).toLocaleString()}</dd></div></dl><div className="long-term-actions"><button className="button primary" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button>{item.status !== "archived" && <button className="button secondary" disabled={busy||readonly} onClick={() => void patch({ status: "archived" }, "Memo archived.")}>Archive</button>}<button className="text-button danger" disabled={busy||readonly} onClick={() => void remove()}><Icon name="trash" />Delete</button></div></>}
  </div>;
}
