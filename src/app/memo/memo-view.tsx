"use client";
import { ErrorNotice } from "@/components/error-notice";
import { fetchMemoryPages } from "@/lib/memory-page-client";
import { responseError } from "@/lib/response-error";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import {MemoLink as Link,useMemoData} from "@/components/memo-data-context";
import {useLocale} from "@/components/locale-controller";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { memoStatusOptions, memoTypeOptions, optionLabel, plainExcerpt } from "@/lib/long-term-memory";
import type { Memo, MemoStatus, MemoType } from "@/lib/types";
import { MemoCapture } from "./memo-capture";
import styles from "./echo.module.css";

const englishTypes: Record<MemoType, string> = { basic: "Basics", supplement: "Details", event: "Events", note: "Notes" };
const englishStatuses: Record<MemoStatus, string> = { active: "Active", merged: "Merged", archived: "Archived", historical: "Historical" };

export function MemoView({ initial }: { initial: Memo[] }) {
  const { read, local, complete } = useMemoData();
  const { english } = useLocale();
  const [items, setItems] = useState(initial);
  const [knownTags, setKnownTags] = useState(() => [...new Set(initial.flatMap(item => item.tags))].sort());
  const [query, setQuery] = useRememberedState("MemoView:query", "");
  const [tag, setTag] = useRememberedState("MemoView:tag", "");
  const [type, setType] = useRememberedState<"" | MemoType>("MemoView:type", "");
  const [status, setStatus] = useRememberedState<"" | MemoStatus>("MemoView:status", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filterKey = JSON.stringify([query.trim(), tag, type, status]);
  const [loadedFilterKey, setLoadedFilterKey] = useState(JSON.stringify(["", "", "", ""]));
  const filtered = Boolean(query.trim() || tag || type || status);
  const awaitingResults = filterKey !== loadedFilterKey;
  const pendingResults = loading || (awaitingResults && !error);
  const shownItems = awaitingResults ? [] : items;

  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim()); if (tag) params.set("tag", tag); if (type) params.set("type", type); if (status) params.set("status", status);
    try {
      let next: Memo[];
      if (!local) {
        params.set("page", "1");
        next = await fetchMemoryPages<Memo>("/api/memos", params, signal, read);
      } else {
        const response = await read("/api/memos?" + params, { cache: "no-store", signal });
        if (!response.ok) throw new Error(await responseError(response, "Could not load Memo."));
        next = await response.json() as Memo[];
      }
      if (!signal?.aborted) {
        setItems(next);
        setLoadedFilterKey(filterKey);
        if (!filtered) {
          setKnownTags([...new Set(next.flatMap(item => item.tags))].sort());
        }
      }
    }
    catch (reason) { if(!signal?.aborted)setError(reason instanceof Error ? reason.message : "Could not load Memo."); }
    finally { if(!signal?.aborted)setLoading(false); }
  }, [query, status, tag, type, read, local, filtered, filterKey]);
  useDataRefresh("/memo", () => load());

  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>void load(controller.signal),180);return()=>{clearTimeout(timer);controller.abort();};},[load]);

  return <div className={`page ${styles.echo}`}>
    <header className={styles.masthead}>
      <h1 className={styles.innerTitle}>{english ? "Memos" : "碎片"}</h1>
      <MemoCapture knownTags={knownTags} onSaved={load} />
    </header>
    {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
    <label className={styles.search}>
      <Icon name="search" />
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={english ? "Search your memos…" : "搜索碎片标题和正文…"} aria-label={english ? "Search Memo" : "搜索碎片"} />
    </label>
    <section id="echo-memos" className={styles.memos} aria-labelledby="echo-memos-title" aria-busy={pendingResults}>
    <div className={styles.filters} aria-label={english ? "Memo filters" : "碎片筛选"}>
      <button type="button" aria-pressed={!filtered} onClick={() => { setQuery(""); setTag(""); setType(""); setStatus(""); }}>{english ? "All" : "全部"}</button>
      {memoTypeOptions.map(option => <button type="button" key={option.value} aria-pressed={type === option.value} onClick={() => setType(type === option.value ? "" : option.value)}>{english ? englishTypes[option.value] : option.label}</button>)}
      <label><select value={status} data-selected={Boolean(status)} onChange={event => setStatus(event.target.value as "" | MemoStatus)} aria-label={english ? "Filter Memo by status" : "按状态筛选碎片"}><option value="">{english ? "Status" : "状态"}</option>{memoStatusOptions.map(option => <option key={option.value} value={option.value}>{english ? englishStatuses[option.value] : option.label}</option>)}</select><Icon name="chevronDown" /></label>
      {knownTags.length > 0 && <label><select value={tag} data-selected={Boolean(tag)} onChange={event => setTag(event.target.value)} aria-label={english ? "Filter Memo by tag" : "按标签筛选碎片"}><option value="">{english ? "Tags" : "标签"}</option>{knownTags.map(item => <option value={item} key={item}>{item}</option>)}</select><Icon name="chevronDown" /></label>}
    </div>
    <div className={styles.sectionHeading}>
      <h2 id="echo-memos-title">{english ? filtered ? "Matching Memos" : "All Memos" : filtered ? "筛选结果" : "全部碎片"}</h2>
      <span role="status">{pendingResults ? (english ? "Searching…" : "正在搜索…") : !awaitingResults && items.length}</span>
    </div>
    {local&&<p className="chronicle-scope">{english?`Searching downloaded Memo${complete?"":" · latest 100 only"}`:`搜索已下载碎片${complete?"":" · 仅最近100条"}`}</p>}
    {shownItems.length ? <div className={styles.list}>{shownItems.map(item => <Link className={`memo-row ${styles.row}`} href={`/memo/${item.id}`} key={item.id}>
      <span className={styles.rowTop}><strong>{item.title}</strong><small className={styles.badge} data-status={item.status}>{english ? englishStatuses[item.status] : optionLabel(memoStatusOptions, item.status)}</small></span>
      <span className={styles.excerpt}>{plainExcerpt(item.content)}</span>
      <span className={styles.rowBottom}><span className={styles.tags}>{item.tags.slice(0, 3).map(value => <span key={value}>{value}</span>)}{item.tags.length > 3 && <span>+{item.tags.length - 3}</span>}</span>
        <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(english ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai" })}</time></span>
    </Link>)}</div> : !pendingResults && !error && <div className={styles.empty}><Icon name="memory" variant="stroke" /><h3>{english ? "No matching Memo" : "没有匹配的碎片"}</h3><p>{english ? "Adjust the filters or keep a new long-term memory." : "调整筛选，或新增一条长期记忆。"}</p></div>}
    </section>
  </div>;
}
