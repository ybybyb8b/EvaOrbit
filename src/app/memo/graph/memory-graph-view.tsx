"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNotice } from "@/components/error-notice";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { graphWebUrl, type GraphOfflineSnapshot } from "@/lib/memory-graph-offline";
import { fetchMemoryPages } from "@/lib/memory-page-client";
import type { MemoryPage } from "@/lib/memory-pagination";
import { responseError } from "@/lib/response-error";
import type { MemoryEntity, MemoryFact, MemoryFactCandidate, MemoryFactDetail, MemoryRecallHit, MemorySource } from "@/lib/types";
import { GraphIcon } from "../echo-entries";
import echo from "../echo.module.css";
import { GraphCanvas } from "./graph-canvas";
import { graphActivity, graphDate, graphProjection, graphTime, literal, relatedIds, typeIcons, typeName } from "./graph-model";
import { EntityContent, FactContent, ReviewContent } from "./graph-inspector";
import styles from "./graph.module.css";

const endpoint = "/api/memory-graph";
type Initial = {
  entities: MemoryPage<MemoryEntity>;
  facts: MemoryPage<MemoryFact>;
  candidates: MemoryPage<MemoryFactCandidate>;
  sourceCount: number;
};
type GraphData = { entities: MemoryEntity[]; facts: MemoryFact[]; candidates: MemoryFactCandidate[] };
type Detail = MemoryFactDetail & { entities: MemoryEntity[] };
type Selection = { kind: "entity" | "fact"; id: string } | { kind: "review" };

async function remaining<T extends { id: string }>(resource: string, page: MemoryPage<T>, signal: AbortSignal, filters: Record<string, string> = {}) {
  if (!page.next_cursor) return page.items;
  const next = await fetchMemoryPages<T>(endpoint, new URLSearchParams({ resource, cursor: page.next_cursor, ...filters }), signal);
  return [...new Map([...page.items, ...next].map(item => [item.id, item])).values()];
}

export function MemoryGraphWebView(props: { initial: Initial; initialFactId?: string }) {
  const router = useRouter();
  return <MemoryGraphView {...props} onRefresh={() => router.refresh()}/>;
}

export function MemoryGraphView({ initial, initialFactId, offline, onRefresh }: {
  initial: Initial; initialFactId?: string; offline?: GraphOfflineSnapshot; onRefresh?: () => void;
}) {
  const { english } = useLocale();
  const tr = (en: string, zh: string) => english ? en : zh;
  const [loaded, setLoaded] = useState<{ initial: Initial; data: GraphData }>();
  const [loadFailure, setLoadFailure] = useState<{ initial: Initial; message: string }>();
  const data = loaded?.initial === initial ? loaded.data : {
    entities: initial.entities.items, facts: initial.facts.items, candidates: initial.candidates.items,
  };
  const loading = loaded?.initial !== initial && loadFailure?.initial !== initial
    && Boolean(initial.entities.next_cursor || initial.facts.next_cursor || initial.candidates.next_cursor);
  const [selection, setSelection] = useState<Selection | null>(initialFactId ? { kind: "fact", id: initialFactId } : null);
  const [focused, setFocused] = useState<string | null>(null);
  const [ego, setEgo] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [type, setType] = useState("");
  const [history, setHistory] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [recall, setRecall] = useState<{ query: string; facts: MemoryFact[]; error?: string }>();
  const [searching, setSearching] = useState(false);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [editedEntities, setEditedEntities] = useState<MemoryEntity[]>([]);
  const [entitySaveVersion, setEntitySaveVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    if (!initial.entities.next_cursor && !initial.facts.next_cursor && !initial.candidates.next_cursor) return;
    void Promise.all([
      remaining("entity", initial.entities, signal, { include_merged: "true" }),
      remaining("fact", initial.facts, signal),
      remaining("candidate", initial.candidates, signal, { status: "pending" }),
    ]).then(([entities, facts, candidates]) => {
      if (!signal.aborted) setLoaded({ initial, data: { entities, facts, candidates } });
    }).catch(reason => {
      if (!signal.aborted) setLoadFailure({ initial, message: String(reason) });
    });
    return () => controller.abort();
  }, [initial]);

  useEffect(() => {
    if (!offline && window.location.hash === "#memory-candidates") {
      const frame = requestAnimationFrame(() => setSelection({ kind: "review" }));
      return () => cancelAnimationFrame(frame);
    }
  }, [offline]);

  const selectedFact = selection?.kind === "fact" ? selection.id : null;
  const [factState, setFactState] = useState<{ id: string; detail?: Detail; error?: string }>();
  const [factRetry, setFactRetry] = useState(0);
  useEffect(() => {
    if (offline || !selectedFact) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const id = selectedFact;
    async function load() {
      const params = new URLSearchParams({ resource: "fact", id, order: "created" });
      const response = await fetch(endpoint + "?" + params, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Could not load the fact."));
      const detail: Detail = await response.json();
      const cursor = detail.sourcesPage?.next_cursor;
      if (cursor) {
        try {
          detail.sources = [...detail.sources, ...await fetchMemoryPages<MemorySource>(endpoint,
            new URLSearchParams({ resource: "source", fact_id: id, order: "created", cursor }), signal)];
        } catch (reason) {
          if (!signal.aborted) setFactState({ id, detail, error: String(reason) });
          return;
        }
      }
      if (!signal.aborted) setFactState({ id, detail });
    }
    void load().catch(reason => {
      if (!signal.aborted) setFactState({ id, error: String(reason) });
    });
    return () => controller.abort();
  }, [selectedFact, factRetry, initial, offline]);

  const cachedFact = offline?.facts.find(fact => fact.id === selectedFact);
  const detail = useMemo(() => offline
    ? cachedFact && { fact: cachedFact, sources: offline.sources.filter(source => source.factId === cachedFact.id), entities: [] }
    : factState?.id === selectedFact ? factState?.detail : undefined, [offline, cachedFact, selectedFact, factState]);
  const allEntities = useMemo(() => data.entities.filter(entity => entity.status !== "merged").map(entity => {
    const edited = editedEntities.find(item => item.id === entity.id);
    return edited && graphTime(edited.updatedAt) >= graphTime(entity.updatedAt) ? edited : entity;
  }), [data.entities, editedEntities]);
  const entityById = useMemo(() => new Map([...(detail?.entities ?? []), ...data.entities, ...allEntities].map(entity => [entity.id, entity])), [data.entities, detail, allEntities]);
  const entities = useMemo(() => allEntities.filter(entity => !type || entity.entityType === type), [allEntities, type]);
  const visibleFacts = useMemo(() => data.facts.filter(fact => history || fact.status === "active"), [data.facts, history]);
  const graph = useMemo(() => graphProjection(entities, visibleFacts, focused, ego, selectedFact), [entities, visibleFacts, focused, ego, selectedFact]);
  const activity = useMemo(() => graphActivity(entities, visibleFacts), [entities, visibleFacts]);
  const types = [...new Set(allEntities.map(entity => entity.entityType))].sort((a, b) => typeName(a, english).localeCompare(typeName(b, english)));
  const primaryTypes = ["person", "place", "concept", "event"].filter(kind => types.includes(kind));
  const pending = data.candidates.filter(candidate => !reviewed.includes(candidate.id));
  const number = new Intl.NumberFormat(english ? "en" : "zh-CN");

  const term = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (value: string) => value.normalize("NFKC").toLocaleLowerCase().includes(term);
  const matchedEntities = term ? allEntities.filter(entity => [entity.canonicalName, ...entity.aliases].some(matches)).slice(0, 8) : [];
  const directFacts = term ? data.facts.filter(fact => matches(fact.predicate) || matches(fact.predicate.replaceAll("_", " "))
    || matches(fact.objectEntityId ? entityById.get(fact.objectEntityId)?.canonicalName ?? "" : literal(fact.objectValue))) : [];
  const matchedFacts = [...new Map([...directFacts, ...(recall?.query === term ? recall.facts : [])].map(fact => [fact.id, fact])).values()].slice(0, 8);

  function chooseEntity(id: string) {
    const entity = entityById.get(id);
    if (type && entity?.entityType !== type) setType("");
    setFocused(id);
    setSelection({ kind: "entity", id });
    setSearchOpen(false);
  }

  function chooseFact(id: string) {
    const fact = data.facts.find(item => item.id === id) ?? matchedFacts.find(item => item.id === id);
    if (fact) {
      setFocused(fact.subjectEntityId);
      if (type && (entityById.get(fact.subjectEntityId)?.entityType !== type
        || fact.objectEntityId && entityById.get(fact.objectEntityId)?.entityType !== type)) setType("");
      if (fact.status === "invalidated") setHistory(true);
    }
    setSelection({ kind: "fact", id });
    setSearchOpen(false);
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!term || searching) return;
    setSearchOpen(true);
    if (offline) return;
    setSearching(true);
    try {
      const response = await fetch(endpoint + "?" + new URLSearchParams({ q: query.trim(), limit: "8" }));
      if (!response.ok) throw new Error(await responseError(response, "Graph recall failed."));
      const hits: MemoryRecallHit[] = await response.json();
      setRecall({ query: term, facts: hits.map(hit => hit.fact) });
    } catch (reason) {
      setRecall({ query: term, facts: [], error: String(reason) });
    } finally {
      setSearching(false);
    }
  }

  function filter(value: string) {
    setType(value);
    setFocused(null);
    setEgo(false);
  }

  const activeEntity = selection?.kind === "entity" ? entityById.get(selection.id) : undefined;
  const sourceError = offline && selectedFact && !cachedFact
    ? tr("This fact is not in the downloaded graph.", "此事实不在已下载的图谱中。")
    : factState?.id === selectedFact ? factState?.error : undefined;
  return <div className={`page ${echo.echo} ${styles.page}`}>
    <header className={`${echo.masthead} ${styles.masthead}`}>
      <div><p>People, ideas, and the links between them.</p><h1 className={echo.innerTitle}>Memory Graph</h1></div>
      {offline ? <a className={styles.manage} href={graphWebUrl + "#memory-candidates"} target="_blank" rel="noreferrer"
        aria-label={tr("Manage graph on the web", "在网页版管理图谱")}><GraphIcon/></a>
        : <button className={styles.manage} type="button" aria-label={tr("Manage graph", "管理图谱")}
          onClick={() => setSelection({ kind: "review" })}><GraphIcon/></button>}
    </header>

    <form className={`${echo.search} ${styles.search}`} role="search" onSubmit={search}>
      <button type="submit" className={echo.searchIcon} aria-label={tr("Search graph", "搜索图谱")}><Icon name="search"/></button>
      <input type="search" value={query} maxLength={1000} placeholder={tr("Search the graph...", "搜索图谱…")}
        aria-label={tr("Search the graph", "搜索图谱")} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }}
        onFocus={() => setSearchOpen(true)} onKeyDown={event => { if (event.key === "Escape") setSearchOpen(false); }}/>
    </form>
    {searchOpen && term && <section className={styles.results} aria-label={tr("Graph search results", "图谱搜索结果")}>
      <header><strong>{tr("Matches", "搜索结果")}</strong><button type="button" onClick={() => setSearchOpen(false)} aria-label={tr("Close search results", "收起搜索结果")}><Icon name="close"/></button></header>
      {matchedEntities.map(entity => <button type="button" key={entity.id} onClick={() => chooseEntity(entity.id)}>
        <Icon name={typeIcons[entity.entityType] ?? "memory"}/><span>{entity.canonicalName}</span><small>{typeName(entity.entityType, english)}</small>
      </button>)}
      {matchedFacts.map(fact => <button type="button" key={fact.id} onClick={() => chooseFact(fact.id)}>
        <GraphIcon/><span>{entityById.get(fact.subjectEntityId)?.canonicalName} · {fact.predicate}</span><small>Fact</small>
      </button>)}
      {searching && <p role="status">{tr("Recalling…", "正在召回…")}</p>}
      {!searching && !matchedEntities.length && !matchedFacts.length && <p>{offline
        ? tr("No matches in the downloaded graph.", "已下载的图谱中没有匹配。")
        : loading ? tr("Loading graph…", "正在载入图谱…") : tr("No matches. Press Search to try Recall.", "没有匹配。可提交搜索进行召回。")}</p>}
      {recall?.query === term && recall.error && <ErrorNotice inline role="alert">{recall.error}</ErrorNotice>}
    </section>}

    <div className={styles.filters} role="group" aria-label={tr("Filter entities by type", "按实体类型筛选")}>
      <button type="button" aria-pressed={!type} onClick={() => filter("")}>{tr("All", "全部")}</button>
      {primaryTypes.map(kind => <button type="button" key={kind} aria-pressed={type === kind} onClick={() => filter(kind)}>{typeName(kind, english)}</button>)}
      {types.length > 0 && <label><select aria-label={tr("Entity type", "实体类型")} data-active={Boolean(type)} value={type} onChange={event => filter(event.target.value)}>
        <option value="">{tr("Type", "类型")}</option>
        {types.map(kind => <option key={kind} value={kind}>{typeName(kind, english)}</option>)}
      </select><Icon name="chevronDown"/></label>}
    </div>

    {loadFailure?.initial === initial && <ErrorNotice inline role="alert">
      {tr("Part of the graph could not load.", "部分图谱未能载入。")} <button type="button" onClick={onRefresh}>{tr("Retry", "重试")}</button>
    </ErrorNotice>}
    <GraphCanvas graph={graph} focused={focused} selectedFact={selectedFact} ego={ego} english={english} resetVersion={resetVersion}
      onEgo={() => { if (!focused && graph.nodes[0]) setFocused(graph.nodes[0].id); setEgo(!ego); }}
      onEntity={chooseEntity} onFact={chooseFact}/>
    <div className={styles.mapActions}>
      <button type="button" onClick={() => { setFocused(null); setEgo(false); setResetVersion(version => version + 1); }}>{tr("Reset view", "重置视角")}</button>
      <label><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)}/>{tr("Show history", "显示历史")}</label>
    </div>

    <div className={styles.stats} aria-label={tr("Graph totals", "图谱统计")} aria-busy={loading}>
      <span><Icon name="memory"/><b>{number.format(allEntities.length)}{loaded?.initial !== initial && initial.entities.has_more ? "+" : ""}</b> {tr("Entities", "实体")}</span>
      <span><GraphIcon/><b>{number.format(data.facts.length)}{loaded?.initial !== initial && initial.facts.has_more ? "+" : ""}</b> {tr("Facts", "事实")}</span>
      <span><Icon name="chronicle"/><b>{number.format(initial.sourceCount)}</b> {tr("Sources", "来源")}</span>
    </div>
    {pending.length > 0 && <button type="button" className={styles.review} onClick={() => setSelection({ kind: "review" })}>
      <span className={styles.itemIcon}><Icon name="tasks"/></span>
      <span><strong>{english ? `Review ${number.format(pending.length)}${loaded?.initial !== initial && initial.candidates.has_more ? "+" : ""} ${pending.length === 1 ? "candidate" : "candidates"}` : `审核 ${number.format(pending.length)}${loaded?.initial !== initial && initial.candidates.has_more ? "+" : ""} 条候选`}</strong>
        <small>{tr("Check new or updated information", "核对新提出或更新的记忆")}</small></span>
      <span className={styles.chevron} aria-hidden="true">›</span>
    </button>}

    <section className={styles.recent} aria-labelledby="graph-recent">
      <header><h2 id="graph-recent">{tr("Recently Updated", "最近更新")}</h2>
        {activity.length > 3 && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? tr("Show less", "收起") : tr("View all", "查看全部")}</button>}
      </header>
      {activity.length ? <div className={styles.activity}>
        {(showAll ? activity : activity.slice(0, 3)).map(row => <button type="button" key={row.entity.id} onClick={() => chooseEntity(row.entity.id)}>
          <span className={styles.itemIcon}><Icon name={typeIcons[row.entity.entityType] ?? "memory"}/></span>
          <span><strong>{row.entity.canonicalName}</strong><small>{row.created ? tr("New", "新增") : tr("Updated", "已更新")} · {number.format(row.relatedFacts)} {tr(row.relatedFacts === 1 ? "related fact" : "related facts", "条关联事实")}</small></span>
          <time dateTime={new Date(graphTime(row.time)).toISOString()}>{graphDate(row.time, english)}</time>
          <span className={styles.chevron} aria-hidden="true">›</span>
        </button>)}
      </div> : <p className={styles.empty}>{tr("No recent activity in this view.", "当前视图没有近期活动。")}</p>}
    </section>

    {selection && <FormSheet key={selection.kind === "review" ? "review"
      : selection.kind === "entity" ? selection.id + ":" + entitySaveVersion : selection.id}
      className={styles.sheet} title={selection.kind === "review" ? tr("Review candidates", "审核候选")
      : selection.kind === "entity" ? activeEntity?.canonicalName ?? tr("Entity", "实体") : tr("Fact details", "事实详情")}
      onClose={() => setSelection(null)}>
      {selection.kind === "review" ? <ReviewContent candidates={pending} entityById={entityById} incomplete={loading || loadFailure?.initial === initial} english={english}
        onReviewed={id => { setReviewed(ids => [...ids, id]); onRefresh?.(); }}/>
        : selection.kind === "entity" && activeEntity ? <EntityContent key={activeEntity.id} entity={activeEntity} facts={data.facts.filter(fact => relatedIds(fact).has(activeEntity.id))}
          entityById={entityById} english={english} loading={loading} chooseEntity={chooseEntity} chooseFact={chooseFact} readOnly={Boolean(offline)}
          onSaved={entity => {
            setEditedEntities(entities => [...entities.filter(item => item.id !== entity.id), entity]);
            setEntitySaveVersion(version => version + 1);
            onRefresh?.();
          }}
          onFocus={() => { setEgo(true); setSelection(null); }}/>
        : selection.kind === "fact" && <FactContent detail={detail} error={sourceError} entityById={entityById} facts={data.facts}
          english={english} chooseEntity={chooseEntity} chooseFact={chooseFact} readOnly={Boolean(offline)}
          onProposed={() => { setSelection({ kind: "review" }); onRefresh?.(); }}
          onRetry={offline ? undefined : () => { setFactState(undefined); setFactRetry(value => value + 1); }}/>}
    </FormSheet>}
  </div>;
}
