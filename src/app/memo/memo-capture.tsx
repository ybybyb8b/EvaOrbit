"use client";

import { useState, type FormEvent } from "react";
import { ToastNotice } from "@/components/action-toast";
import { PageLogAction } from "@/components/bottom-log-core";
import { useBusinessRequest } from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { useFormPreview } from "@/components/form-preview";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { parseTagInput } from "@/lib/long-term-memory";
import { responseError } from "@/lib/response-error";
import { MemoEditor, type MemoDraft } from "./memo-editor";
import styles from "./echo.module.css";

const emptyDraft = (): MemoDraft => ({ title: "", content: "", type: "note", status: "active", tags: "", eventDate: "", confirmedAt: "", mergedIntoId: "" });

export function MemoCapture({ knownTags, onSaved }: { knownTags: string[]; onSaved?: () => void | Promise<void> }) {
  const businessFetch = useBusinessRequest();
  const readonly = useFormPreview();
  const { english } = useLocale();
  const [draft, setDraft] = useState<MemoDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || readonly || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await businessFetch("/api/memos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, mergedIntoId: null, tags: parseTagInput(draft.tags), eventDate: draft.eventDate || null, confirmedAt: draft.confirmedAt || null }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not create Memo."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create Memo.");
      return;
    } finally {
      setSaving(false);
    }
    setDraft(null);
    setNotice(english ? "Memo saved." : "碎片已保存。");
    await onSaved?.();
  }

  return <>
    <PageLogAction label="新增碎片" className={styles.add} onClick={() => { setError(""); setDraft(emptyDraft()); }}>
      <Icon name="plus" />{english ? "New Memo" : "新增碎片"}
    </PageLogAction>
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    {draft && <FormSheet title="Keep something important" onClose={() => setDraft(null)} formId="memo-create-form" submitLabel="Save Memo" busy={saving} submitDisabled={readonly}>
      <form id="memo-create-form" className="editor-card long-term-editor" onSubmit={submit}>
        <MemoEditor draft={draft} onChange={setDraft} knownTags={knownTags} />
        {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      </form>
    </FormSheet>}
  </>;
}
