"use client";
import {useWorkspaceData,WorkspaceLink as Link} from "@/components/workspace-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";

import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { ChoiceSelect } from "@/components/choice-select";
import { SuggestedInput } from "@/components/suggested-input";
import { ToastNotice } from "@/components/action-toast";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { WorkspacePageHeader as PageHeader } from "@/components/workspace-data-context";
import { diarySuggestedTags, parseTagInput, plainExcerpt } from "@/lib/long-term-memory";
import type { LuciusDiaryEntry } from "@/lib/types";

export function DiaryView({ initial }: { initial: LuciusDiaryEntry[] }) {
  const {read}=useWorkspaceData(),preview=useFormPreview();
  const [items, setItems] = useState(initial); const [query, setQuery] = useRememberedState("DiaryView:query", ""); const [tag, setTag] = useRememberedState("DiaryView:tag", ""); const [showForm, setShowForm] = useState(false); const [date, setDate] = useState(currentLocalDate); const [content, setContent] = useState(""); const [tags, setTags] = useState(""); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const knownTags = useMemo(() => [...new Set([...diarySuggestedTags, ...items.flatMap((item) => item.tags)])], [items]);
  const load = useCallback(async () => { setLoading(true); setError(""); const params = new URLSearchParams({ limit: "100" }); if (query.trim()) params.set("q", query.trim()); if (tag) params.set("tag", tag); try { const response = await read(`/api/lucius/diary?${params}`, { cache: "no-store" }); if (!response.ok) throw new Error(await responseError(response, "Could not load Diary.")); setItems(await response.json() as LuciusDiaryEntry[]); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load Diary."); } finally { setLoading(false); } }, [query, tag,read]);
  useDataRefresh("/lucius/diary", () => load());

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);
  async function submit(event: FormEvent) { event.preventDefault();if(preview)return; setSaving(true); setError(""); try { const response = await read("/api/lucius/diary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, content, tags: parseTagInput(tags) }) }); if (!response.ok) throw new Error(await responseError(response, "Could not create Diary entry.")); await response.json() as LuciusDiaryEntry; setShowForm(false); setNotice("Diary entry saved."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create Diary entry."); } finally { setSaving(false); } }
  return <div className="page diary-page"><PageHeader eyebrow="LUCIUS" title="Diary" action={<button className="button primary" onClick={() => { setDate(currentLocalDate()); setContent(""); setTags(""); setShowForm(true); }}><Icon name="plus" />新增记录</button>} />
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}{showForm && <FormSheet title="Write from here" onClose={() => setShowForm(false)} formId="diary-create-form" submitLabel="Save entry" busy={saving} submitDisabled={preview}><form id="diary-create-form" className="editor-card long-term-editor" onSubmit={submit}>{preview&&<FormPreviewNotice/>}<div className="editor-title"><div><span className="eyebrow">NEW DIARY ENTRY</span><h2>Write from here</h2></div><button type="button" className="text-button" onClick={() => setShowForm(false)}>Cancel</button></div><div className="form-grid"><label className="field"><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="field"><span>Tags</span><SuggestedInput suggestionLabel="标签" suggestions={[...diarySuggestedTags, ...knownTags]} tags value={tags} onValueChange={nextValue => setTags(nextValue)} placeholder="日常, 连接, 成长" /></div><label className="field wide"><span>Content</span><textarea autoFocus required rows={12} maxLength={100000} value={content} onChange={(event) => setContent(event.target.value)} /></label></div>{error && <ErrorNotice>{error}</ErrorNotice>}<div className="form-actions"><button className="button primary" disabled={preview||saving}>{saving ? "Saving…" : "Save entry"}</button></div></form></FormSheet>}
    {!showForm && error && <ErrorNotice>{error}</ErrorNotice>}<div className="long-term-toolbar diary-toolbar" aria-busy={loading}><label className="search-box"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Diary…" /></label><ChoiceSelect value={tag} onChange={(event) => setTag(event.target.value)}><option value="">All tags</option>{knownTags.map((value) => <option value={value} key={value}>{value}</option>)}</ChoiceSelect><span className="result-count">{items.length}</span></div>
    {items.length ? <div className="diary-timeline" aria-busy={loading}>{items.map((item) => <Link href={`/lucius/diary/${item.id}`} key={item.id}><time dateTime={item.date}>{item.date}</time><span><strong>{plainExcerpt(item.content, 220)}</strong>{item.tags.length > 0 && <span className="tag-line">{item.tags.map((value) => <em key={value}>{value}</em>)}</span>}</span><Icon name="arrow" /></Link>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="chronicle" /></span><h2>No Diary entries</h2><p>Write a subjective note or adjust the filters.</p></div>}
  </div>;
}
