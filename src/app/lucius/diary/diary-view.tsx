"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorNotice } from "@/components/error-notice";
import { Icon } from "@/components/icons";
import { JournalArchive } from "@/components/journal-archive";
import journal from "@/components/journal-reading.module.css";
import { useLocale } from "@/components/locale-controller";
import { useDataRefresh } from "@/components/use-data-refresh";
import { useRememberedState } from "@/components/use-remembered-state";
import { useWorkspaceData, WorkspaceLink as Link, WorkspacePageHeader as PageHeader } from "@/components/workspace-data-context";
import { diarySuggestedTags, plainExcerpt } from "@/lib/long-term-memory";
import { responseError } from "@/lib/response-error";
import type { LuciusDiaryEntry } from "@/lib/types";
import styles from "./diary-view.module.css";

export function DiaryView({ initial }: { initial: LuciusDiaryEntry[] }) {
  const { read } = useWorkspaceData();
  const { english } = useLocale();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useRememberedState("DiaryView:query", "");
  const [tag, setTag] = useRememberedState("DiaryView:tag", "");
  const [date, setDate] = useRememberedState("DiaryView:date", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const knownTags = useMemo(
    () => [...new Set([...diarySuggestedTags, ...initial.flatMap(item => item.tags), ...items.flatMap(item => item.tags), tag].filter(Boolean))],
    [initial, items, tag],
  );
  const filtered = Boolean(query.trim() || tag || date);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim());
    if (tag) params.set("tag", tag);
    if (date) params.set("date", date);
    const fallback = english ? "Could not load Diary." : "无法载入日记。";
    try {
      const response = await read(`/api/lucius/diary?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(await responseError(response, fallback));
      const entries = await response.json() as LuciusDiaryEntry[];
      if (!controller.signal.aborted) setItems(entries);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : fallback);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [query, tag, date, read, english]);
  useDataRefresh("/lucius/diary", load);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [load]);

  return <div className={`page diary-page ${journal.index}`}>
    <PageHeader eyebrow="LUCIUS" title="Diary" />
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <div className={`${journal.toolbar} ${styles.filters}`} aria-busy={loading}>
      <label className={`search-box ${journal.search} ${styles.search}`}>
        <Icon name="search" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={english ? "Search Diary…" : "搜索日记…"} aria-label={english ? "Search Diary" : "搜索日记"} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label={english ? "Clear search" : "清除搜索"}><Icon name="close" /></button>}
      </label>
      <div className={styles.datePicker} data-selected={Boolean(date)}>
        <label>
          <span>{english ? "Date" : "日期"}</span>
          <input ref={dateInput} type="date" value={date} onChange={event => setDate(event.target.value)} aria-label={english ? "Choose Diary date" : "选择日记日期"} />
        </label>
        {date && <button type="button" onClick={() => { setDate(""); dateInput.current?.focus(); }} aria-label={english ? "Clear date filter" : "清除日期筛选"}><Icon name="close" /></button>}
      </div>
      <select value={tag} onChange={event => setTag(event.target.value)} aria-label={english ? "Filter Diary by tag" : "按标签筛选日记"}>
        <option value="">{english ? "All tags" : "全部标签"}</option>
        {knownTags.map(value => <option value={value} key={value}>{value}</option>)}
      </select>
      <span className={journal.count} role="status">{english ? `${items.length} ${items.length === 1 ? "entry" : "entries"}` : `${items.length} 篇`}</span>
    </div>
    {items.length ? <JournalArchive entries={items} english={english} className="diary-timeline" busy={loading} renderEntry={item =>
      <Link className={journal.entry} href={`/lucius/diary/${item.id}`}>
        <span className={`${journal.excerpt} ${journal.diaryExcerpt}`}>{plainExcerpt(item.content, 220)}</span>
        {item.tags.length > 0 && <span className={journal.tags}>{item.tags.map(value => <span className={journal.tag} key={value}>{value}</span>)}</span>}
      </Link>
    } /> : !loading && !error && <div className="empty-state">
      <span className="empty-icon"><Icon name="chronicle" /></span>
      <h2>{filtered ? (english ? "No matching entries" : "没有符合条件的日记") : (english ? "No Diary entries" : "还没有日记")}</h2>
      {filtered && <p>{english ? "Try another date, search, or tag." : "试试其他日期、关键词或标签。"}</p>}
    </div>}
  </div>;
}
