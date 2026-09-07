"use client";

import { type FormEvent, useState } from "react";
import { useLocale } from "@/components/locale-controller";
import type { ApiError } from "@/lib/types";

export function InboxCaptureForm({ onSaved, formId, sheet = false }: { onSaved: () => Promise<void> | void; formId?: string; sheet?: boolean }) {
  const { english } = useLocale();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { const response = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, source: "manual" }) }); if (!response.ok) { setError(((await response.json()) as ApiError).error); return; } setContent(""); await onSaved(); } finally { setSaving(false); } }
  return <form id={formId} className={sheet ? "editor-card inbox-capture inbox-quick-capture" : "capture-card inbox-capture"} onSubmit={submit}>
    <textarea autoFocus required rows={3} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={english ? "What's on your mind?" : "记下此刻想到的事"} />
    <div>{error && <p className="form-error">{error}</p>}{!sheet && <button className="button primary" type="submit" disabled={saving}>{english ? "Capture here" : "先放这里"}</button>}</div>
  </form>;
}
