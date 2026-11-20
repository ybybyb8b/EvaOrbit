"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useServerDataState } from "@/components/use-data-refresh";
import {ChronicleEditor,type ChronicleDraft} from "../chronicle-editor";
import journal from "@/components/journal-reading.module.css";
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
    event.preventDefault(); if (readonly || busy) return; setBusy(true); setError(""); setNotice("");
    const fallback = english ? "Could not update Chronicle entry." : "无法保存纪事。";
    try {
      const response = await businessFetch(`/api/chronicle/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!response.ok) { setError(await responseError(response, fallback)); return; }
      const updated = await response.json() as ChronicleEntry;
      setEntry(updated); setDraft(draftFromEntry(updated)); setEditing(false); setNotice(english ? "Chronicle entry updated." : "纪事已更新");
    } catch {
      setError(fallback);
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

  return <div className={`page chronicle-page chronicle-detail-page ${journal.reader}`}>
    <PageHeader eyebrow={chronicleDateLabel(entry.date,english)} title={entry.title} action={<button className="button secondary" onClick={startEdit} disabled={editing||busy}><Icon name="edit"/>{english?"Edit":"编辑"}</button>} />
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    {!editing && error && <ErrorNotice role="alert">{error}</ErrorNotice>}

    {editing ? <FormSheet title={english ? "Edit Chronicle" : "编辑纪事"} onClose={() => { setEditing(false); setDraft(draftFromEntry(entry)); setError(""); }} formId="chronicle-edit-form" submitLabel={english ? "Save changes" : "保存修改"} busy={busy} submitDisabled={readonly}><form id="chronicle-edit-form" className="editor-card field-focus-surface" onSubmit={submit}>
      <ChronicleEditor draft={draft} onChange={setDraft} error={error} />
    </form></FormSheet> : <>
      <article className={`chronicle-article ${journal.reading}`}><MarkdownMessage content={entry.contentMd} offlineMedia={local} /></article>
      <footer>
        <dl className={journal.metadata}>
          <div><dt>{english ? "Source" : "来源"}</dt><dd>{entry.source === "manual" && !english ? "手动" : sourceLabel(entry.source)}</dd></div>
          <div><dt>{english ? "Created" : "创建于"}</dt><dd><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(english ? "en-US" : "zh-CN")}</time></dd></div>
          <div><dt>{english ? "Updated" : "更新于"}</dt><dd><time dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleString(english ? "en-US" : "zh-CN")}</time></dd></div>
        </dl>
        <div className="chronicle-detail-actions"><button className="text-button danger" onClick={() => void remove()} disabled={busy||readonly}><Icon name="trash" />{english?"Delete":"删除"}</button></div>
      </footer>
    </>}
  </div>;
}
