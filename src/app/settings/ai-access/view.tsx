"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock, Link2 } from "reicon-react";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice } from "@/components/error-notice";
import { Disclosure } from "@/components/disclosure";
import { dateInEvaOrbit } from "@/lib/time";
import type { AgentConnection } from "@/lib/mcp/agent-access";
import {
  agentPermissionAllows, CHATGPT_CLIENT, emptyPolicy, HERMES_CLIENT, legacyChatGptPolicy, parseAgentPolicy,
  projectProgressFields, resourceNames, type AgentPermission, type AgentPolicy,
} from "@/lib/mcp/agent-policy";
import { changeAgentConnection, syncAgentConnections, type AccessActionState } from "./actions";
import styles from "./access.module.css";

type Choice = { id: number; name: string };
export type AccessHistory = {
  id: number; client_id: string; occurred_at: string; resource: string; operation: string; target: string | null;
  result: "started" | "allowed" | "blocked" | "failed";
};
export type ViewProps = {
  connections: AgentConnection[]; selectedId?: string; lastSeen: Record<string, string | null>;
  permissions: AgentPermission[]; projects: Choice[]; trackers: Choice[]; events: AccessHistory[];
  nextBefore?: string; onHistoryPage: boolean;
};

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const states = { pending: "待授权", active: "已连接", paused: "已暂停", revoked: "已撤销", expired: "已到期" };
const results = { started: "已受理", allowed: "成功", blocked: "已拦截", failed: "未完成" };
const progressLabels = { status: "进度状态", next_step: "下一步", resolution: "处理结果" };
const operationLabels: Record<string, string> = { discover: "查看可用功能", schema: "查看功能说明", delete: "删除记录", action: "执行业务操作" };
const commonFeatures = ["project","project_item","inbox","task","calendar_event","tracker","echo","memory_context","health_record","insight_context"];
const featureNotes: Record<string, string> = {
  memory_context: "包含 Echo 正文、相关记忆事实、人物和来源。",
  insight_context: "涵盖饮食、健康、训练、Tracker 和任务，包含分析依据。",
  tracker: "详情含指定 Tracker 的历史记录、目标和提醒。",
  subscription: "查看已保存的账期和付款记录。",
  cat_pet: "详情含猫咪的健康、护理和提醒记录。",
  relation_person: "详情含相关人物笔记和交往信息。",
};

function status(connection: AgentConnection) {
  return connection.state === "active" && connection.expires_at && Date.parse(connection.expires_at) <= Date.now()
    ? "expired" : connection.state;
}

function savedPolicy(value: unknown, permissions: AgentPermission[]) {
  try { return parseAgentPolicy(value, permissions); } catch { return emptyPolicy; }
}

function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function StatusLabel({ connection }: { connection: AgentConnection }) {
  const value = status(connection);
  return <span className={styles.state} data-state={value}>{states[value]}</span>;
}

function ScopePicker({ title, choices, selected, all, change, locked }: {
  title: string; choices: Choice[]; selected: number[]; all: boolean;
  change: (selected: number[], all: boolean) => void; locked: boolean;
}) {
  return <fieldset className={styles.scope} disabled={locked}>
    <legend>{title}</legend>
    <label><input type="checkbox" checked={all} onChange={(event) => change(selected, event.target.checked)} />全部{title}</label>
    {!all && <div className={styles.checkboxList}>
      {!choices.length && <p>当前没有可选项。</p>}
      {choices.map(({ id, name }) => <label key={id}>
        <input type="checkbox" checked={selected.includes(id)} onChange={() => change(toggle(selected, id), false)} />{name}
      </label>)}
    </div>}
  </fieldset>;
}

function Editor({ connection, permissions, projects, trackers, onSaved }: {
  connection: AgentConnection; permissions: AgentPermission[]; projects: Choice[]; trackers: Choice[];
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const original = savedPolicy(connection.policy, permissions);
  const [draft, setDraft] = useState(original);
  const [name, setName] = useState(connection.name);
  const [expires, setExpires] = useState(connection.expires_at ? dateInEvaOrbit(new Date(Date.parse(connection.expires_at) - 1)) : "");
  const [review, setReview] = useState<"save" | "revoke" | null>(null);
  const [feedback, setFeedback] = useState<AccessActionState>();
  const [pending, startTransition] = useTransition();
  const selectable = new Map<string, AgentPermission[]>();
  for (const permission of permissions) {
    const list = selectable.get(permission.resource) ?? [];
    selectable.set(permission.resource, [...list, permission]);
  }
  const selected = permissions.filter(({ key }) => draft.permissions.includes(key));
  const anyProjects = selected.some(({ resource }) => resource.startsWith("project"));
  const anyTrackers = selected.some(({ resource }) => resource === "tracker");
  const anyInbox = selected.some(({ resource }) => resource === "inbox");
  const changed = JSON.stringify(original) !== JSON.stringify(draft) || name !== connection.name ||
    expires !== (connection.expires_at ? dateInEvaOrbit(new Date(Date.parse(connection.expires_at) - 1)) : "");
  const involvesSensitive = selected.some(({ sensitive }) => sensitive);
  const involvesWrites = selected.some(({ writes }) => writes);
  const apply = (command: "save" | "pause" | "resume" | "revoke") => startTransition(async () => {
    const result = await changeAgentConnection({ clientId: connection.client_id, revision: connection.revision,
      command, ...(command === "save" ? { name, expires, policy: draft } : {}) });
    setFeedback(result);
    if (result.ok) { onSaved(result.message); setReview(null); router.refresh(); }
  });
  const patch = (policy: Partial<AgentPolicy>) => setDraft((current) => ({ ...current, ...policy }));
  if (connection.state === "revoked") return <p className={styles.quiet}>此连接的访问权限已收回。需要继续使用时，请从客户端建立新的连接。</p>;
  const moreFeatures = [...selectable.keys()].filter((resource) => !commonFeatures.includes(resource));
  const selectedMore = moreFeatures.filter((resource) => selectable.get(resource)?.some(({ key }) => draft.permissions.includes(key))).length;
  function feature(resource: string) {
    const options = selectable.get(resource);
    if (!options) return null;
    const activeCount = options.filter(({ key }) => draft.permissions.includes(key)).length;
    return <Disclosure key={resource} className={`${styles.disclosure} ${activeCount ? styles.selectedFeature : ""}`}
      title={resourceNames[resource]} trailing={activeCount ? `已选 ${activeCount} 项` : undefined}>
      {featureNotes[resource] && <p>{featureNotes[resource]}</p>}
      <fieldset className={styles.checkboxList} disabled={pending} aria-label={resourceNames[resource]}>
        {options.map(({ key, label }) => <label key={key}><input type="checkbox" checked={draft.permissions.includes(key)}
          onChange={() => patch({ permissions: toggle(draft.permissions, key) })} />{label}</label>)}
      </fieldset>
    </Disclosure>;
  }

  return <>
    <div className={styles.toolbar}>
      {connection.state === "active" && <button className="button secondary" type="button" disabled={pending} onClick={() => apply("pause")}>暂停访问</button>}
      {connection.state === "paused" && <button className="button secondary" type="button" disabled={pending} onClick={() => apply("resume")}>恢复访问</button>}
      <button className={styles.revoke} type="button" disabled={pending} onClick={() => setReview("revoke")}>撤销连接</button>
      <a className={styles.historyLink} href="#agent-history">查看访问记录</a>
    </div>
    {review === "revoke" && <section role="group" aria-label="确认撤销" className={styles.review}>
      <h3>撤销 {connection.name} 的访问？</h3>
      <p>此连接会在下一次访问时被拒绝。仍可在此查看过去的访问记录。</p>
      <div className="form-actions"><button type="button" className="button secondary" disabled={pending} onClick={() => setReview(null)}>取消</button>
        <button type="button" className="button danger" disabled={pending} onClick={() => apply("revoke")}>确认撤销</button></div>
    </section>}
    {connection.state === "pending" && connection.client_id === CHATGPT_CLIENT &&
      <button className="button secondary" type="button" disabled={pending} onClick={() => setDraft(legacyChatGptPolicy(permissions))}>载入 ChatGPT 日常权限</button>}
    {connection.state === "pending" && connection.client_id === HERMES_CLIENT &&
      <button className="button secondary" type="button" disabled={pending} onClick={() => setDraft({ ...emptyPolicy,
        permissions: ["inbox:create", "inbox:search", "inbox:get"] })}>载入 Hermes 收件权限</button>}
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); setFeedback(undefined); setReview("save"); }}>
      <h3>允许的功能</h3>
      <div className={styles.featureGrid}>{commonFeatures.map(feature)}</div>
      <Disclosure className={styles.disclosure} title="更多功能" trailing={selectedMore > 0 ? `已在 ${selectedMore} 个模块授权` : undefined}>
        <div className={styles.featureGrid}>{moreFeatures.map(feature)}</div>
      </Disclosure>
      <p className={styles.quiet}>永久删除、付款和正式记忆写入由你在 EvaOrbit 中操作。</p>
      {(anyProjects || anyTrackers || anyInbox) && <section className={styles.ranges} aria-label="数据范围">
        <h3>数据范围</h3>
        {anyProjects && <ScopePicker title="项目" choices={projects} selected={draft.projectIds} all={draft.allProjects}
          change={(projectIds, allProjects) => patch({ projectIds, allProjects })} locked={pending} />}
        {anyTrackers && <ScopePicker title="Tracker" choices={trackers} selected={draft.trackerIds} all={draft.allTrackers}
          change={(trackerIds, allTrackers) => patch({ trackerIds, allTrackers })} locked={pending} />}
        {anyInbox && <label className={styles.check}><input type="checkbox" checked={draft.inboxOwn} disabled={pending || connection.client_id === HERMES_CLIENT}
          onChange={(event) => patch({ inboxOwn: event.target.checked })} />收件查询与处理仅限此连接提交的记录</label>}
        {draft.permissions.includes("project_item:update") && <fieldset className={styles.scope} disabled={pending}>
          <legend>可修改的项目字段</legend>
          <div className={styles.checkboxList}>{projectProgressFields.map((field) => <label key={field}>
            <input type="checkbox" checked={draft.projectFields.includes(field)}
              onChange={() => patch({ projectFields: toggle(draft.projectFields, field) })} />{progressLabels[field]}
          </label>)}</div>
          <p>项目验收仍在 EvaOrbit 网页中由用户确认。</p>
        </fieldset>}
      </section>}
      <Disclosure className={styles.disclosure} title="连接名称与有效期">
        <div className={styles.advancedGrid}>
          <label className="field"><span>显示名称</span><input value={name} maxLength={100} required disabled={pending} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field"><span>有效至（可留空）</span><input type="date" value={expires} disabled={pending} onChange={(event) => setExpires(event.target.value)} /></label>
        </div>
        <small className={styles.quiet}>到期日按 EvaOrbit 时间计算。清空日期可设为长期授权。</small>
      </Disclosure>
      {review === "save" ? <section className={styles.review} role="group" aria-label="确认授权">
        <h3>确认 {name} 的权限</h3>
        <p>{involvesSensitive ? "包含私人信息。 " : ""}{involvesWrites ? "此连接可写入 EvaOrbit。 " : ""}{expires ? `授权有效至 ${expires}。` : "授权没有到期日。"}</p>
        {selected.length ? <ul>{selected.map(({ key, label }) => <li key={key}>{label}</li>)}</ul> : <p>保存后此连接没有业务权限。</p>}
        {anyProjects && <p>项目范围 · {draft.allProjects ? "全部项目" : projects.filter(({ id }) => draft.projectIds.includes(id)).map(({ name }) => name).join("、") || "未选择"}</p>}
        {anyTrackers && <p>Tracker 范围 · {draft.allTrackers ? "全部 Tracker" : trackers.filter(({ id }) => draft.trackerIds.includes(id)).map(({ name }) => name).join("、") || "未选择"}</p>}
        {anyInbox && <p>收件范围 · {draft.inboxOwn ? "此连接提交的记录" : "全部收件记录"}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={pending} onClick={() => setReview(null)}>返回修改</button>
          <button type="button" className="button primary" disabled={pending} onClick={() => apply("save")}>{pending ? "保存中…" : "确认保存"}</button></div>
      </section> : <div><button className="button primary" disabled={pending || !changed}>{connection.state === "pending" ? "检查授权" : "检查并保存修改"}</button></div>}
    </form>
    {feedback && !feedback.ok && <ErrorNotice role="alert">{feedback.message}</ErrorNotice>}
  </>;
}

export function AiAccessView(props: ViewProps) {
  const { connections, selectedId, permissions, lastSeen, events, nextBefore, onHistoryPage } = props;
  const selected = connections.find(({ client_id }) => client_id === selectedId);
  const [feedback, setFeedback] = useState<AccessActionState>();
  const [saved, setSaved] = useState<{ clientId: string; message: string }>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const accessUrl = selected ? `/settings/ai-access?connection=${selected.client_id}` : "/settings/ai-access";
  return <div className={`page settings-detail-page ${styles.page}`}>
    <PageHeading eyebrow="" title="AI 访问管理" description="选择每个 AI 助手能查看和处理的内容。" />
    <div className={styles.layout}>
      <section className={styles.connections} aria-labelledby="agent-connections">
        <h2 id="agent-connections">连接</h2>
        {connections.length ? <nav className={styles.connectionList} aria-label="AI 连接">
          {connections.map((connection) => {
            const policy = savedPolicy(connection.policy, permissions);
            const capabilities = [...new Set(permissions.filter((permission) => agentPermissionAllows(policy, permission)).map(({ resource }) => resourceNames[resource]))];
            const seen = lastSeen[connection.client_id];
            return <Link className={styles.connection} key={connection.client_id} href={`/settings/ai-access?connection=${connection.client_id}`}
              aria-current={selectedId === connection.client_id ? "page" : undefined}>
              <span className={styles.connectionMark}><Link2 size={19} weight="Outline" aria-hidden="true" /></span>
              <span className={styles.connectionText}><strong>{connection.name}</strong><StatusLabel connection={connection} />
                <small>{capabilities.length && connection.state !== "revoked" ? capabilities.slice(0, 3).join("、") + (capabilities.length > 3 ? ` 等 ${capabilities.length} 项` : "") : "没有开放的功能"}</small>
                <small>{seen ? `最近访问 ${dateFormat.format(new Date(seen))}` : "尚无访问记录"}</small>
              </span><ChevronRight size={17} aria-hidden="true" />
            </Link>;
          })}
        </nav> : <p className={styles.quiet}>在 AI 客户端连接 EvaOrbit 后，可在这里选择它的权限。</p>}
        <button className="button secondary" disabled={pending} type="button" onClick={() => startTransition(async () => {
          const result = await syncAgentConnections(); setFeedback(result); if (result.ok) router.refresh();
        })}>{pending ? "同步中…" : "同步已有连接"}</button>
        {feedback?.ok && <p role="status" className={styles.quiet}>{feedback.message}</p>}
        {feedback && !feedback.ok && <ErrorNotice role="alert">{feedback.message}</ErrorNotice>}
      </section>
      {selected && <div className={styles.details}>
        <section className={styles.panel} aria-labelledby="agent-details">
          <header><h2 id="agent-details">{selected.name}</h2><StatusLabel connection={selected} /></header>
          {selected.authorized_at && <p className={styles.quiet}>首次授权 {dateFormat.format(new Date(selected.authorized_at))}
            {selected.expires_at ? ` · 有效至 ${dateInEvaOrbit(new Date(Date.parse(selected.expires_at) - 1))}` : ""}</p>}
          <Editor key={`${selected.client_id}:${selected.revision}`} connection={selected} permissions={permissions} projects={props.projects} trackers={props.trackers}
            onSaved={(message) => setSaved({ clientId: selected.client_id, message })} />
          {saved?.clientId === selected.client_id && <p role="status" className={styles.quiet}>{saved.message}</p>}
        </section>
        <section className={styles.panel} aria-labelledby="agent-history">
          <header><h2 id="agent-history">访问记录</h2><Clock size={19} weight="Outline" aria-hidden="true" /></header>
          {events.length ? <ol className={styles.history}>{events.map((event) => {
            const label = permissions.find(({ key }) => key === `${event.resource}:${event.operation}`)?.label ??
              operationLabels[event.operation] ?? "访问功能";
            const target = event.target && event.resource === "project" ? props.projects.find(({ id }) => String(id) === event.target)?.name : undefined;
            return <li key={event.id}>
              <time dateTime={event.occurred_at}>{dateFormat.format(new Date(event.occurred_at))}</time>
              <span>{label}{target || event.target ? ` · ${target ?? event.target}` : ""}</span>
              <span data-result={event.result}>{results[event.result]}</span>
            </li>;
          })}</ol> : <p className={styles.quiet}>此连接尚无访问记录。</p>}
          {(nextBefore || onHistoryPage) && <nav className={styles.toolbar} aria-label="访问记录分页">
            {onHistoryPage && <Link className="button secondary" href={accessUrl}>返回最新</Link>}
            {nextBefore && <Link className="button secondary" href={`${accessUrl}&before=${nextBefore}`}>更早记录</Link>}
          </nav>}
        </section>
      </div>}
    </div>
  </div>;
}
