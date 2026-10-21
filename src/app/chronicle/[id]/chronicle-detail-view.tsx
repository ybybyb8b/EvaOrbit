"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useServerDataState } from "@/components/use-data-refresh";
import {ChronicleEditor,type ChronicleDraft} from "../chronicle-editor";
import {useFormPreview} from "@/components/form-preview";
import {useChronicleData} from "@/components/chronicle-data-context";
import {useLocale} from "@/components/locale-controller";
import { ToastNotice, showActionToast } from "@/components/action-toast";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { MarkdownMessage } from "@/components/markdown-message";
import { PageHeading as PageHeader } from "@/components/page-heading";
import {chronicleDateLabel} from "@/lib/chronicle";
import type { ChronicleEntry, ChronicleSource } from "@/lib/types";


function draftFromEntry(entry: ChronicleEntry): ChronicleDraft {
  return { date: entry.date, title: entry.title, contentMd: entry.contentMd, source: entry.source };
}

function sourceLabel(source: ChronicleSource) {
  return source === "chatgpt" ? "ChatGPT" : "Manual";
}


export function ChronicleDetailView({ initial }: { initial: ChronicleEntry }) {
  const router = useRouter();
  return <ChronicleDetailContent initial={initial} onDeleted={()=>{router.push("/chronicle");router.refresh();}}/>;
}
export function ChronicleDetailContent({initial,onDeleted}:{initial:ChronicleEntry;onDeleted:()=>void}){
  const businessFetch=useBusinessRequest();
  const readonly=useFormPreview(),{local}=useChronicleData(),{english}=useLocale();
  const [entry, setEntry] = useServerDataState(initial);
  const [draft, setDraft] = useState<ChronicleDraft>(() => draftFromEntry(initial));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function startEdit() {
    setDraft(draftFromEntry(entry)); setError(""); setNotice(""); setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if(readonly)return; setBusy(true); setError(""); setNotice("");
    try {
      const response = await businessFetch(`/api/chronicle/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
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
    if(readonly)return;
    if (!window.confirm(`Delete “${entry.title}”? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await businessFetch(`/api/chronicle/${entry.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, "Could not delete Chronicle entry.")); return; }
      showActionToast("Chronicle entry deleted", "deleted");
      onDeleted();
    } catch {
      setError("Could not delete Chronicle entry.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page chronicle-page chronicle-detail-page">
    <PageHeader eyebrow={`${chronicleDateLabel(entry.date,english)} · ${entry.source==="manual"&&!english?"手动":sourceLabel(entry.source)}`} title={entry.title} action={<button className="button secondary" onClick={startEdit} disabled={editing||busy}><Icon name="edit"/>{english?"Edit":"编辑"}</button>} />
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    {error && <ErrorNotice role="alert">{error}</ErrorNotice>}

    {editing ? <FormSheet title="Edit Chronicle" onClose={() => { setEditing(false); setDraft(draftFromEntry(entry)); setError(""); }} formId="chronicle-edit-form" submitLabel="Save changes" busy={busy} submitDisabled={readonly}><form id="chronicle-edit-form" className="editor-card chronicle-editor" onSubmit={submit}>
      <ChronicleEditor draft={draft} onChange={setDraft}/>
    </form></FormSheet> : <>
      <article className="chronicle-article"><MarkdownMessage content={entry.contentMd} offlineMedia={local} /></article>
      <div className="chronicle-entry-meta"><span>{english?"Created":"创建于"} {new Date(entry.createdAt).toLocaleString()}</span><span>{english?"Updated":"更新于"} {new Date(entry.updatedAt).toLocaleString()}</span></div>
      <div className="chronicle-detail-actions"><button className="text-button danger" onClick={() => void remove()} disabled={busy||readonly}><Icon name="trash" />{english?"Delete":"删除"}</button></div>
    </>}
  </div>;
}
