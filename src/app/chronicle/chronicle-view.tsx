"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";
import {ChronicleEditor,type ChronicleDraft} from "./chronicle-editor";
import {useFormPreview} from "@/components/form-preview";
import {ChronicleLink as Link,useChronicleData} from "@/components/chronicle-data-context";
import { ToastNotice } from "@/components/action-toast";
import { JournalArchive } from "@/components/journal-archive";
import journal from "@/components/journal-reading.module.css";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { useLocale } from "@/components/locale-controller";
import { chronicleExcerpt } from "@/lib/chronicle";
import type { ChronicleEntry } from "@/lib/types";


function emptyDraft(): ChronicleDraft {
  return { date: currentLocalDate(), title: "", contentMd: "", source: "manual" };
}

export function ChronicleView({ initial }: { initial: ChronicleEntry[] }) {
  const businessFetch=useBusinessRequest();
  const { english } = useLocale();
  const readonly=useFormPreview(),{read,local,complete}=useChronicleData();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useRememberedState("ChronicleView:query", "");
  const [draft, setDraft] = useState<ChronicleDraft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
      setLoading(true); setError("");
      try {
        const response = await read(`/api/chronicle?q=${encodeURIComponent(query)}&limit=100`, { cache: "no-store", signal });
        if (!response.ok) throw new Error(await responseError(response, "Could not load Chronicle."));
        const next = await response.json() as ChronicleEntry[];
        if (!signal?.aborted) setItems(next);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Could not load Chronicle.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
  }, [query,read]);
  useDataRefresh("/chronicle", () => load());
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  function openCreate() {
    setDraft(emptyDraft()); setError(""); setSaveError(""); setNotice(""); setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (readonly || saving) return; setSaving(true); setSaveError("");
    const fallback = english ? "Could not create Chronicle entry." : "无法保存纪事。";
    try {
      const response = await businessFetch("/api/chronicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) { setSaveError(await responseError(response, fallback)); return; }
      const created = await response.json() as ChronicleEntry;
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setShowForm(false); setDraft(emptyDraft()); setNotice(english ? "Chronicle entry saved." : "纪事已保存");
    } catch {
      setSaveError(fallback);
    } finally {
      setSaving(false);
    }
  }

  return <div className={`page chronicle-page ${journal.index}`}>
    <PageHeader eyebrow={english ? "ARCHIVE" : "归档"} title="Chronicle" action={<PageLogAction label={english?"Add entry":"新增记录"} className="button primary" onClick={openCreate}><Icon name="plus" />{english ? "Add entry" : "新增记录"}</PageLogAction>} />

    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    {showForm && <FormSheet title={english ? "Add to Chronicle" : "新增纪事"} onClose={() => { setShowForm(false); setSaveError(""); }} formId="chronicle-create-form" submitLabel={english ? "Save entry" : "保存纪事"} busy={saving} submitDisabled={readonly}><form id="chronicle-create-form" className="editor-card field-focus-surface" onSubmit={submit}>
      <ChronicleEditor draft={draft} onChange={setDraft} error={saveError} />
    </form></FormSheet>}

    {!showForm && error && <ErrorNotice role="alert">{error}</ErrorNotice>}
    <div className={journal.toolbar} aria-busy={loading}>
      <label className={`search-box ${journal.search}`}><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={english?"Search titles and entries…":"搜索标题和正文…"} aria-label={english?"Search Chronicle titles and content":"搜索 Chronicle 标题和正文"} />{query && <button type="button" onClick={() => setQuery("")} aria-label={english?"Clear search":"清除搜索"}><Icon name="close"/></button>}</label>
      <span className={journal.count} role="status">{loading?(english?"Searching…":"正在搜索…"):`${items.length}${items.length===100?"+":""} ${english?(items.length===1?"entry":"entries"):"篇"}`}</span>
    </div>

    {local&&<p className="chronicle-scope">{english?`Searching downloaded entries${complete?"":" · latest 100 only"}`:`搜索已下载的纪事${complete?"":" · 仅最近 100 篇"}`}</p>}
    {!local&&items.length===100&&<p className="chronicle-scope">{english?"Showing the latest 100 matches. Refine your search to find earlier entries.":"显示最近 100 条结果，可搜索更早的纪事。"}</p>}
    {items.length ? <JournalArchive entries={items} english={english} busy={loading} renderEntry={entry =>
      <Link className={`chronicle-row ${journal.entry}`} href={`/chronicle/${entry.id}`}>
        <span className="chronicle-row-heading"><strong className={journal.title}>{entry.title}</strong></span>
        <span className={journal.excerpt}>{chronicleExcerpt(entry.contentMd)}</span>
        {entry.source === "chatgpt" && <span className={journal.tags}><span className={journal.tag}>ChatGPT</span></span>}
      </Link>
    } /> : loading ? <p role="status">{english?"Loading entries…":"正在加载纪事…"}</p> : error ? <button className="button secondary" onClick={()=>void load()}>{english?"Try again":"重试"}</button> : <div className="empty-state chronicle-empty"><span className="empty-icon"><Icon name="chronicle" /></span><h2>{query ? "No matching entries" : "Chronicle is empty"}</h2><p>{query ? "Try a different title or phrase." : "Add a dated Markdown entry to begin."}</p>{!query && <button className="button secondary" onClick={openCreate}><Icon name="plus" />New entry</button>}</div>}
  </div>;
}
