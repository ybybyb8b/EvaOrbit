"use client";
import { useId } from "react";
import { FormSheet } from "./form-sheet";
import { HermesErrorNotice } from "./hermes-error-notice";
import { ReiconGlyph } from "./reicon-icons";
import styles from "./hermes-note-sheet.module.css";

export function HermesNoteSheet({ draft, onChange, onSend, onClose, english, busy, available, error, onDismissError }: {
  draft: string; onChange: (value: string) => void; onSend: () => Promise<boolean>; onClose: () => void;
  english: boolean; busy: boolean; available: boolean; error: string; onDismissError: () => void;
}) {
  const formId = useId(), t = (en: string, zh: string) => english ? en : zh;
  return <FormSheet bare closeIcon={<ReiconGlyph name="close" className={styles.closeIcon} />} title={t("Sticky note", "便利贴")} className={styles.sheet} formId={formId} submitLabel={t("Send to Hermes", "交给 Hermes")} submitDisabled={!available || !draft.trim()} busyLabel={t("Saving…", "保存中…")} cancelLabel={t("Write later", "稍后再写")} busy={busy} dirty={false} onClose={onClose}>
    <form id={formId} className={styles.paper} onSubmit={event => { event.preventDefault(); if (available && draft.trim() && !busy) void onSend(); }}>
      <textarea aria-label={t("Note content", "便利贴内容")} placeholder={t("Anything on your mind…", "随手写点什么……")} maxLength={20000} rows={7} value={draft} disabled={busy} onChange={event => onChange(event.target.value)} />
    </form>
    {error && <><HermesErrorNotice error={error} /><button type="button" className="text-button" onClick={onDismissError}>{t("Dismiss notice", "关闭提示")}</button></>}
  </FormSheet>;
}
