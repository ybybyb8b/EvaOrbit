"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";
import { ChoiceSelect } from "@/components/choice-select";
import {MemoEditor,type MemoDraft} from "./memo-editor";
import {useFormPreview} from "@/components/form-preview";
import {MemoLink as Link,useMemoData} from "@/components/memo-data-context";
import {useLocale} from "@/components/locale-controller";
import { ToastNotice } from "@/components/action-toast";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { memoStatusOptions, memoTypeOptions, optionLabel, parseTagInput, plainExcerpt } from "@/lib/long-term-memory";
import type { Memo, MemoStatus, MemoType } from "@/lib/types";

const emptyDraft = (): MemoDraft => ({ title: "", content: "", type: "note", status: "active", tags: "", eventDate: "", confirmedAt: "", mergedIntoId:"" });

export function MemoView({ initial }: { initial: Memo[] }) {
  const businessFetch=useBusinessRequest();
  const {read,local,complete}=useMemoData(),readonly=useFormPreview(),{english}=useLocale();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useRememberedState("MemoView:query", "");
  const [tag, setTag] = useRememberedState("MemoView:tag", "");
  const [type, setType] = useRememberedState<"" | MemoType>("MemoView:type", "");
  const [status, setStatus] = useRememberedState<"" | MemoStatus>("MemoView:status", "");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<MemoDraft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const knownTags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);

  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim()); if (tag) params.set("tag", tag); if (type) params.set("type", type); if (status) params.set("status", status);
    try { const response = await read(`/api/memos?${params}`, { cache: "no-store",signal }); if (!response.ok) throw new Error(await responseError(response, "Could not load Memo.")); const next=await response.json() as Memo[]; if(!signal?.aborted)setItems(next); }
    catch (reason) { if(!signal?.aborted)setError(reason instanceof Error ? reason.message : "Could not load Memo."); }
    finally { if(!signal?.aborted)setLoading(false); }
  }, [query, status, tag, type,read]);
  useDataRefresh("/memo", () => load());

  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>void load(controller.signal),180);return()=>{clearTimeout(timer);controller.abort();};},[load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if(readonly)return; setSaving(true); setError("");
    try {
      const response = await businessFetch("/api/memos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, mergedIntoId:null,tags: parseTagInput(draft.tags), eventDate: draft.eventDate || null, confirmedAt: draft.confirmedAt || null }) });
      if (!response.ok) throw new Error(await responseError(response, "Could not create Memo."));
      await response.json() as Memo; setShowForm(false); setDraft(emptyDraft()); setNotice("Memo saved."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create Memo."); }
    finally { setSaving(false); }
  }

  return <div className="page memo-page">
    <PageHeader eyebrow="长期记忆" title="Memo" action={<span className="memo-header-actions">{!local&&<Link className="button secondary" href="/memo/graph"><Icon name="memory" />Memory Graph</Link>}<PageLogAction label="新增碎片" className="button primary" onClick={() => { setDraft(emptyDraft()); setShowForm(true); }}><Icon name="plus" />新增碎片</PageLogAction></span>} />
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    {showForm && <FormSheet title="Keep something important" onClose={() => setShowForm(false)} formId="memo-create-form" submitLabel="Save Memo" busy={saving} submitDisabled={readonly}><form id="memo-create-form" className="editor-card long-term-editor" onSubmit={submit}>
      <MemoEditor draft={draft} onChange={setDraft} knownTags={knownTags}/>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}

    </form></FormSheet>}
    {!showForm && error && <ErrorNotice role="alert">{error}</ErrorNotice>}
    <div className="long-term-toolbar" aria-busy={loading}>
      <label className="search-box"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title and content…" aria-label="Search Memo" /></label>
      <ChoiceSelect value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter Memo by tag"><option value="">All tags</option>{knownTags.map((item) => <option value={item} key={item}>{item}</option>)}</ChoiceSelect>
      <ChoiceSelect value={type} onChange={(event) => setType(event.target.value as "" | MemoType)} aria-label="Filter Memo by type"><option value="">All types</option>{memoTypeOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect>
      <ChoiceSelect value={status} onChange={(event) => setStatus(event.target.value as "" | MemoStatus)} aria-label="Filter Memo by status"><option value="">All statuses</option>{memoStatusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect>
      <span className="result-count" role="status">{loading?(english?"Searching…":"正在搜索…"):items.length}</span>
    </div>
    {local&&<p className="chronicle-scope">{english?`Searching downloaded Memo${complete?"":" · latest 100 only"}`:`搜索已下载碎片${complete?"":" · 仅最近100条"}`}</p>}
    {items.length ? <div className="memo-list" aria-busy={loading}>{items.map((item) => <Link className="memo-row" href={`/memo/${item.id}`} key={item.id}>
      <span className="memo-row-copy"><span><strong>{item.title}</strong><small>{optionLabel(memoTypeOptions, item.type)} · {optionLabel(memoStatusOptions, item.status)}</small></span><span>{plainExcerpt(item.content)}</span>{item.tags.length > 0 && <span className="tag-line">{item.tags.map((value) => <em key={value}>{value}</em>)}</span>}</span>
      <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString()}</time><Icon name="arrow" />
    </Link>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="memory" /></span><h2>No matching Memo</h2><p>Adjust the filters or keep a new long-term memory.</p></div>}
  </div>;
}
