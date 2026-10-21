"use client";
import {useBusinessRequest} from "@/components/business-request-context";

import { ErrorNotice } from "@/components/error-notice";
import { type FormEvent, useState } from "react";
import { useLocale } from "@/components/locale-controller";
import {responseError} from "@/lib/response-error";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";

export function InboxCaptureForm({ onSaved, formId, sheet = false }: { onSaved: () => Promise<void> | void; formId?: string; sheet?: boolean }) {
  const businessFetch=useBusinessRequest();
  const { english } = useLocale();
  const readonly=useFormPreview();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (readonly||saving) return; setSaving(true); setError(""); try { const response = await businessFetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, source: "manual" }) }); if (!response.ok) { setError(await responseError(response,english?"Could not capture Inbox item.":"暂时无法保存，请重试。")); return; } setContent(""); await onSaved(); } catch(reason){setError(reason instanceof Error?reason.message:english?"Could not capture Inbox item.":"暂时无法保存，请重试。");} finally { setSaving(false); } }
  return <form id={formId} className={sheet ? "editor-card inbox-capture inbox-quick-capture" : "capture-card inbox-capture"} onSubmit={submit}>
    {readonly&&<FormPreviewNotice/>}
    <textarea aria-label={english?"Inbox content":"Inbox 内容"} autoFocus required rows={3} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={english ? "What's on your mind?" : "记下此刻想到的事"} />
    <div>{error && <ErrorNotice>{error}</ErrorNotice>}{!sheet && <button className="button primary" type="submit" disabled={saving||readonly}>{english ? "Capture here" : "先放这里"}</button>}</div>
  </form>;
}
