"use client";
import {useWorkspaceData} from "@/components/workspace-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";

import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useServerDataState } from "@/components/use-data-refresh";
import { SuggestedInput } from "@/components/suggested-input";
import { ToastNotice, showActionToast } from "@/components/action-toast";
import journal from "@/components/journal-reading.module.css";
import { useLocale } from "@/components/locale-controller";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { WorkspacePageHeader as PageHeader } from "@/components/workspace-data-context";
import { diarySuggestedTags, parseTagInput } from "@/lib/long-term-memory";
import type { LuciusDiaryEntry } from "@/lib/types";

export function DiaryDetailContent({ initial,navigate }: { initial: LuciusDiaryEntry;navigate:(path:string)=>void }) {
  const {read}=useWorkspaceData(),preview=useFormPreview();
  const { english } = useLocale();
 const [item, setItem] = useServerDataState(initial); const [date, setDate] = useState(initial.date); const [content, setContent] = useState(initial.content); const [tags, setTags] = useState(initial.tags.join(", ")); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) { event.preventDefault();if(preview)return; setBusy(true); setError(""); try { const response = await read(`/api/lucius/diary/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, content, tags: parseTagInput(tags) }) }); if (!response.ok) throw new Error(await responseError(response, "Could not update Diary.")); const updated = await response.json() as LuciusDiaryEntry; setItem(updated); setEditing(false); setNotice("Diary entry updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update Diary."); } finally { setBusy(false); } }
  async function remove() {if(preview)return; if (!window.confirm(`Delete Diary entry from ${item.date}? This cannot be undone.`)) return; setBusy(true); try { const response = await read(`/api/lucius/diary/${item.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await responseError(response, "Could not delete Diary entry.")); showActionToast("Diary entry deleted", "deleted"); navigate("/lucius/diary"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete Diary entry."); } finally { setBusy(false); } }
  const locale = english ? "en-US" : "zh-CN";
  const dateLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${item.date}T12:00:00`));
  return <div className={`page diary-page long-term-detail ${journal.reader}`}>
    <PageHeader eyebrow={english ? "LUCIUS DIARY" : "LUCIUS 日记"} title={<time dateTime={item.date}>{dateLabel}</time>} action={<button className="button secondary" onClick={() => setEditing(true)} disabled={editing || busy}><Icon name="edit" />{english ? "Edit" : "编辑"}</button>} />
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}{error && <ErrorNotice>{error}</ErrorNotice>}
    {editing ? <FormSheet title="Edit Diary entry" onClose={() => { setDate(item.date); setContent(item.content); setTags(item.tags.join(", ")); setEditing(false); }} formId="diary-edit-form" submitLabel="Save changes" busy={busy} submitDisabled={preview}><form id="diary-edit-form" className="editor-card long-term-editor" onSubmit={submit}>{preview&&<FormPreviewNotice/>}<div className="form-grid"><label className="field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="field"><span>Tags</span><SuggestedInput suggestionLabel="标签" suggestions={[...diarySuggestedTags, ...item.tags]} tags value={tags} onValueChange={nextValue => setTags(nextValue)} /></div><label className="field wide"><span>Content</span><textarea required rows={18} value={content} onChange={(event) => setContent(event.target.value)} /></label></div><div className="form-actions"><button className="button primary" disabled={preview||busy}>Save changes</button><button type="button" className="text-button" onClick={() => { setDate(item.date); setContent(item.content); setTags(item.tags.join(", ")); setEditing(false); }}>Cancel</button></div></form></FormSheet> : <>
      <article className={`long-term-prose ${journal.reading}`}>{item.content}</article>
      <footer>
        {item.tags.length > 0 && <div className={journal.tags}>{item.tags.map(value => <span className={journal.tag} key={value}>{value}</span>)}</div>}
        <dl className={journal.metadata}><div>
          <dt>{english ? "Updated" : "更新于"}</dt><dd><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString(locale)}</time></dd>
        </div></dl>
        <div><button className="text-button danger" disabled={preview || busy} onClick={() => void remove()}><Icon name="trash" />{english ? "Delete" : "删除"}</button></div>
      </footer>
    </>}
  </div>;
}
