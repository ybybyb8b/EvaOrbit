import { useRef, useState, type FormEvent } from "react";
import { ErrorNotice } from "@/components/error-notice";
import { Icon } from "@/components/icons";
import { graphWebUrl } from "@/lib/memory-graph-offline";
import { responseError } from "@/lib/response-error";
import type { MemoryEntity, MemoryFact, MemoryFactCandidate, MemoryFactDetail } from "@/lib/types";
import { graphDate, literal, relatedIds, typeName } from "./graph-model";
import styles from "./graph.module.css";

type Lookup = ReadonlyMap<string, MemoryEntity>;
type DetailNavigation = { english: boolean; entityById: Lookup; chooseEntity: (id: string) => void; chooseFact: (id: string) => void };
const epistemic = {
  direct_statement: ["Direct statement", "直接陈述"], recorded_observation: ["Recorded observation", "记录观察"],
  derived: ["Inference", "推导"], agent_judgment: ["Agent judgment", "Agent 判断"],
  external_report: ["External report", "外部资料"], unknown: ["Unspecified", "未标注"],
} as const;

function entityName(byId: Lookup, id: string | null, fallback: string) {
  return (id && byId.get(id)?.canonicalName) || fallback;
}

function webSource(url: string | null) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function EntityContent({ entity, facts, loading, english, entityById, chooseEntity, chooseFact, onFocus, onSaved, readOnly }:
  DetailNavigation & { entity: MemoryEntity; facts: MemoryFact[]; loading: boolean; onFocus: () => void; onSaved: (entity: MemoryEntity) => void; readOnly?: boolean }) {
  const tr = (en: string, zh: string) => english ? en : zh;
  const [editing, setEditing] = useState(false);
  const links = new Set(facts.flatMap(fact => [...relatedIds(fact)]));
  links.delete(entity.id);
  const rows = (historical: boolean) => facts.filter(fact => (fact.status === "invalidated") === historical).map(fact => (
    <button type="button" key={fact.id} onClick={() => chooseFact(fact.id)}>
      <strong>{fact.predicate}</strong><small>{entityName(entityById, fact.subjectEntityId, tr("Unknown entity", "未知实体"))} → {
        fact.objectEntityId ? entityName(entityById, fact.objectEntityId, tr("Unknown entity", "未知实体")) : literal(fact.objectValue)
      }</small>
    </button>
  ));
  const current = rows(false);
  const past = rows(true);
  return <div className={styles.inspector}>
    <div className={styles.detailHeading}>
      <span>{typeName(entity.entityType, english)}{entity.status === "archived" && tr(" · Archived", " · 已归档")}</span>
      <button type="button" onClick={onFocus}>{tr("Focus on entity", "聚焦实体")}</button>
      {!readOnly && entity.status !== "merged" && <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing}>{tr("Edit entity", "编辑实体")}</button>}
    </div>
    {editing && <GraphEditor english={english} submitLabel={tr("Save entity", "保存实体")} submit={async fields => {
      const response = await fetch("/api/memory-graph/entities/" + entity.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: fields.get("name"), aliases: String(fields.get("aliases")).split(/\r?\n/).map(alias => alias.trim()).filter(Boolean),
          description: String(fields.get("description")).trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not save the entity."));
      onSaved(await response.json());
      setEditing(false);
    }}>
      <label>{tr("Name", "名称")}<input name="name" required maxLength={200} defaultValue={entity.canonicalName}/></label>
      <label>{tr("Aliases (one per line)", "别名（每行一个）")}<textarea name="aliases" defaultValue={entity.aliases.join("\n")}/></label>
      <label>{tr("Description", "描述")}<textarea name="description" maxLength={5000} defaultValue={entity.description ?? ""}/></label>
    </GraphEditor>}
    {entity.description && <p>{entity.description}</p>}
    {entity.aliases.length > 0 && <p><strong>{tr("Aliases", "别名")}</strong> · {entity.aliases.join(" · ")}</p>}
    {links.size > 0 && <section>
      <h3>{tr("Related entities", "关联实体")}</h3>
      <div className={styles.related}>{[...links].map(id => {
        const match = entityById.get(id);
        return match && <button type="button" key={id} onClick={() => chooseEntity(id)}>{match.canonicalName}</button>;
      })}</div>
    </section>}
    <section><h3>{tr("Current facts", "当前事实")}</h3>
      {current.length ? <div className={styles.detailList}>{current}</div> : <p>{tr("No current facts.", "暂无当前事实。")}</p>}
    </section>
    <section><h3>{tr("History", "历史")}</h3>
      {past.length ? <div className={styles.detailList}>{past}</div> : <p>{tr("No historical facts.", "暂无历史事实。")}</p>}
    </section>
    {loading && <p role="status">{tr("Loading more facts…", "正在载入更多事实…")}</p>}
  </div>;
}

export function FactContent({ detail, error, entityById, facts, english, chooseEntity, chooseFact, onRetry, onProposed, readOnly }:
  DetailNavigation & { detail?: MemoryFactDetail; error?: string; facts: MemoryFact[]; onRetry?: () => void; onProposed: () => void; readOnly?: boolean }) {
  const tr = (en: string, zh: string) => english ? en : zh;
  const missing = tr("Unknown entity", "未知实体");
  const failure = error && <ErrorNotice inline role="alert">{error} {onRetry && <button type="button" onClick={onRetry}>{tr("Retry", "重试")}</button>}</ErrorNotice>;
  if (!detail) return failure || <p role="status">{tr("Loading fact and sources…", "正在载入事实和来源…")}</p>;
  const { fact, sources } = detail;
  const next = facts.filter(item => item.supersedesFactId === fact.id);
  const revisionCount = next.length + (fact.supersedesFactId ? 1 : 0);
  const predicate = /^[a-z]+(?:_[a-z]+)+$/.test(fact.predicate) ? fact.predicate.replaceAll("_", " ") : fact.predicate;
  const shownObject = fact.objectEntityId ? entityName(entityById, fact.objectEntityId, missing) : literal(fact.objectValue);
  return <div className={`${styles.inspector} ${styles.factInspector}`}>
    <div className={styles.factLead}>
      <div className={styles.detailHeading}><span>{fact.status === "active" ? tr("Current", "当前") : tr("Invalidated", "已失效")}</span></div>
      <div className={styles.factStatement}>
        <button type="button" onClick={() => chooseEntity(fact.subjectEntityId)}>{entityName(entityById, fact.subjectEntityId, missing)}</button>
        <span title={fact.predicate}>{predicate}</span>
        {fact.objectEntityId ? <button type="button" onClick={() => chooseEntity(fact.objectEntityId!)}>{shownObject}</button> : <p>{shownObject}</p>}
      </div>
      {fact.invalidationReason && <p className={styles.factNote}>{fact.invalidationReason}</p>}
    </div>
    <dl className={styles.metadata}>
      <div><dt>{tr("Validity", "有效期")}</dt><dd>{fact.validFrom ?? tr("Unspecified", "未指定")} → {fact.validTo ?? tr("Open", "开放")}</dd></div>
      <div><dt>{tr("Confidence", "可信度")}</dt><dd>{Math.round(fact.confidence * 100)}%</dd></div>
      <div><dt>{tr("Importance", "重要性")}</dt><dd>{fact.importance}</dd></div>
    </dl>
    <dl className={styles.metadataSecondary}>
      <div><dt>{tr("Knowledge type", "认知类型")}</dt><dd>{epistemic[fact.epistemicType]?.[english ? 0 : 1] ?? fact.epistemicType}</dd></div>
      <div><dt>{tr("Perspective", "归属视角")}</dt><dd>{entityName(entityById, fact.perspectiveEntityId, tr("Unspecified", "未指定"))}</dd></div>
      <div><dt>{tr("Updated", "已更新")}</dt><dd>{graphDate(fact.updatedAt, english)}</dd></div>
    </dl>
    <section id="memory-sources"><h3>{tr("Sources", "来源")}</h3>
      {failure}
      {sources.length ? sources.map(source => {
        const href = webSource(source.sourceUrl);
        return <article key={source.id} className={styles.factSource}>
          <div className={styles.sourceIdentity}>
            <strong>{source.sourceResource}</strong>
            {source.sourceRecordId && <span>{source.sourceRecordId}</span>}
          </div>
          {source.excerpt && <blockquote>{source.excerpt}</blockquote>}
          {source.note && <p className={styles.factNote}>{source.note}</p>}
          {href && <a href={href} target="_blank" rel="noreferrer">{tr("Open source", "打开来源")}</a>}
        </article>;
      }) : !error && <p>{readOnly ? tr("No downloaded source for this fact.", "此事实没有已下载的来源。")
        : tr("No source is attached to this fact.", "此事实尚无来源。")}</p>}
    </section>
    {revisionCount > 0 && <section>
      <div className={styles.revisionHeading}>
        <h3>{tr("Revision history", "修正历史")}</h3>
        <span>{tr(`${revisionCount} linked ${revisionCount === 1 ? "version" : "versions"}`, `${revisionCount} 个关联版本`)}</span>
      </div>
      <div className={styles.revisions}>
        {fact.supersedesFactId && <button type="button" onClick={() => chooseFact(fact.supersedesFactId!)}>
          <span>{tr("View previous version", "查看上一版本")}</span><Icon name="chevronDown"/>
        </button>}
        {next.map(item => <button type="button" key={item.id} onClick={() => chooseFact(item.id)}>
          <span>{tr("View later revision", "查看后续修正")} <small>· {graphDate(item.updatedAt, english)}</small></span><Icon name="chevronDown"/>
        </button>)}
      </div>
    </section>}
    {readOnly && <a className="text-button" href={graphWebUrl + "?fact=" + encodeURIComponent(fact.id)} target="_blank" rel="noreferrer">
      {tr("View fact on the web", "在网页版查看事实")}
    </a>}
    {!readOnly && fact.status === "active" && entityById.get(fact.subjectEntityId)?.status === "active"
      && (!fact.perspectiveEntityId || entityById.get(fact.perspectiveEntityId)?.status === "active")
      && <Correction key={fact.id} fact={fact} entityById={entityById} english={english} onProposed={onProposed}/>}
  </div>;
}

function Correction({ fact, entityById, english, onProposed }:
  { fact: MemoryFact; entityById: Lookup; english: boolean; onProposed: () => void }) {
  const tr = (en: string, zh: string) => english ? en : zh;
  const [editing, setEditing] = useState(false);
  const [objectId, setObjectId] = useState(fact.objectEntityId && entityById.get(fact.objectEntityId)?.status === "active" ? fact.objectEntityId : "");
  const request = useRef<{ body: string; id: string } | null>(null);
  async function submit(fields: FormData) {
    let value = null;
    if (!objectId) {
      try { value = JSON.parse(String(fields.get("value"))); }
      catch { throw new Error(tr("Enter a valid JSON value. Put quotes around plain text.", "请输入有效的 JSON 值，纯文本请加双引号。")); }
      if (value === null) throw new Error(tr("Enter a value other than null.", "请输入非空值。"));
    }
    const body = {
      fact: { subjectEntityId: fact.subjectEntityId, predicate: fact.predicate, objectEntityId: objectId || null, objectValue: value,
        perspectiveEntityId: fact.perspectiveEntityId, epistemicType: fact.epistemicType, supersedesFactId: fact.id,
        confidence: fact.confidence, importance: fact.importance, validFrom: fact.validFrom, validTo: fact.validTo },
      sources: [{ sourceResource: "manual", sourceUrl: fields.get("sourceUrl"), excerpt: fields.get("evidence") }], proposedBy: "user",
    };
    const serialized = JSON.stringify(body);
    if (request.current?.body !== serialized) request.current = { body: serialized, id: crypto.randomUUID() };
    const response = await fetch("/api/memory-graph", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: request.current.id }),
    });
    if (!response.ok) throw new Error(await responseError(response, "Could not submit the correction."));
    onProposed();
  }
  return <section>
    <button type="button" className={styles.correction} aria-expanded={editing} onClick={() => setEditing(!editing)}>
      <Icon name="edit"/>
      <span><strong>{tr("Propose a correction", "提出修正")}</strong><small>{tr("Suggest a change for review", "提出变更，提交审核")}</small></span>
      <Icon name="chevronDown"/>
    </button>
    {editing && <GraphEditor english={english} submitLabel={tr("Send for review", "提交审核")} submit={submit}>
      <label>{tr("Object", "宾语")}<select aria-label={tr("Object", "宾语")} value={objectId} onChange={event => setObjectId(event.target.value)}>
        <option value="">{tr("JSON value", "JSON 值")}</option>
        {[...entityById.values()].filter(entity => entity.status === "active").map(entity =>
          <option key={entity.id} value={entity.id}>{entity.canonicalName}</option>)}
      </select></label>
      {!objectId && <label>{tr("Object value", "宾语值")}<textarea name="value" required defaultValue={fact.objectValue == null ? "" : JSON.stringify(fact.objectValue)}/></label>}
      <label>{tr("Evidence link", "证据链接")}<input name="sourceUrl" type="url" inputMode="url" required maxLength={2000}/></label>
      <label>{tr("Evidence excerpt", "证据摘录")}<textarea name="evidence" required maxLength={10000}/></label>
    </GraphEditor>}
  </section>;
}

function GraphEditor({ english, submitLabel, submit, children }:
  { english: boolean; submitLabel: string; submit: (fields: FormData) => Promise<void>; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try { await submit(new FormData(event.currentTarget)); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  return <form className={styles.editor} onSubmit={save}>
    {children}
    {error && <ErrorNotice inline role="alert">{error}</ErrorNotice>}
    <button type="submit" className="button primary" disabled={busy}>{busy ? (english ? "Saving…" : "正在保存…") : submitLabel}</button>
  </form>;
}

export function ReviewContent({ candidates, entityById, incomplete, english, onReviewed }:
  { candidates: MemoryFactCandidate[]; entityById: Lookup; incomplete: boolean; english: boolean; onReviewed: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tr = (en: string, zh: string) => english ? en : zh;
  async function review(id: string, action: "promote" | "reject") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/memory-graph/candidates/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not review the candidate."));
      onReviewed(id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  return <div id="memory-candidates" className={styles.inspector}>
    <p>{tr("Review proposed memories before they enter the graph.", "核对候选记忆，再决定是否纳入图谱。")}</p>
    {error && <ErrorNotice inline role="alert">{error}</ErrorNotice>}
    {candidates.length === 0 && <p>{incomplete ? tr("The candidate list is incomplete.", "候选列表尚未载入完整。") : tr("No pending candidates.", "暂无待审核候选。")}</p>}
    {candidates.map(candidate => {
      const fact = candidate.proposedFact;
      const fallback = tr("Unknown entity", "未知实体");
      return <article key={candidate.id} className={styles.source}>
        <small>{candidate.proposedBy}{candidate.proposerModel ? " · " + candidate.proposerModel : ""}</small>
        <h3>{entityName(entityById, fact.subjectEntityId, fallback)} · {fact.predicate}</h3>
        <p>{fact.objectEntityId ? entityName(entityById, fact.objectEntityId, fallback) : literal(fact.objectValue)}</p>
        {candidate.proposedSources.map((source, index) => <blockquote key={index}>
          <strong>{source.sourceResource}</strong>{source.excerpt && <p>{source.excerpt}</p>}
          {webSource(source.sourceUrl) && <a href={webSource(source.sourceUrl)} target="_blank" rel="noreferrer">{tr("Open source", "打开来源")}</a>}
        </blockquote>)}
        <div className={styles.reviewActions}>
          <button type="button" className="button secondary" disabled={busy} onClick={() => void review(candidate.id, "reject")}>{tr("Reject", "拒绝")}</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void review(candidate.id, "promote")}>{tr("Add to Graph", "纳入图谱")}</button>
        </div>
      </article>;
    })}
  </div>;
}
