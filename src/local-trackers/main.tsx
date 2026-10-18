import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { LocaleController } from "../components/locale-controller";
import { FormSheet } from "../components/form-sheet";
import { ChoiceSelect } from "../components/choice-select";
import { Icon } from "../components/icons";
import { TrackerCardContent } from "../components/tracker-card-content";
import { TrackerEntryEditor } from "../app/trackers/tracker-entry-editor";
import { LocalTrackerStore, newTrackerLocalId, type LocalTrackerRecord } from "../lib/tracker-local-store";
import { validatedTrackerValues } from "../lib/tracker-values";
import { parseNewTracker, parseNewTrackerEntry, parseNewTrackerField } from "../lib/validation";
import { formatTrackerTimeRange } from "../lib/tracker-time-range";
import type { TrackerField } from "../lib/types";
import { nativeCall } from "../lib/native-bridge";
import { applyAppearance, storedAppearance, COLOR_THEME_STORAGE_KEY } from "../lib/theme-runtime";
import { normalizeColorTheme } from "../lib/theme";
import { trackerPlatform, startBrowserPreview, isPreviewAccount, type LocalAccount, type TrackerPlatform } from "./platform";
import "../app/globals.css";
import "./style.css";

const platform = trackerPlatform();
function localAppearance() { try { return storedAppearance(); } catch { return { appearanceMode: "system" as const, colorTheme: "editorial" as const }; } }
applyAppearance(localAppearance().appearanceMode, localAppearance().colorTheme, false);

function App() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { platform.account().then(setAccount).catch(reason => setError(String(reason))).finally(() => setReady(true)); }, []);
  if (!ready) return <main className="page"><p role="status">正在打开本地记录…</p></main>;
  return <LocaleController localOnly><div className="local-tracker-app">
    {account ? <TrackerWorkspace key={account.accountId} account={account} platform={platform} onSignIn={() => setSigningIn(true)} onSignOut={() => { setAccount(null); }} /> : <main className="page"><header className="page-header"><div><h1>Trackers</h1><p>连接账户后，记录会保存在本机，离线也能继续使用。</p></div></header><button className="button primary" onClick={() => setSigningIn(true)}>连接 EvaOrbit</button>{!platform.native && <button className="button secondary" onClick={() => void startBrowserPreview().then(setAccount).catch(reason => setError(String(reason)))}>本机预览</button>}{error && <p role="alert" className="form-error">{error}</p>}</main>}
    {signingIn && <Login platform={platform} onClose={() => setSigningIn(false)} onSignedIn={next => { setAccount(next); setSigningIn(false); }} />}
  </div></LocaleController>;
}

function Login({ platform, onClose, onSignedIn }: { platform: TrackerPlatform; onClose: () => void; onSignedIn: (account: LocalAccount) => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const account = await platform.signIn(email, password); setPassword(""); onSignedIn(account); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "连接失败，请重试"); }
    finally { setBusy(false); }
  }
  return <FormSheet title="连接 EvaOrbit" onClose={onClose} formId="local-login" submitLabel="登录" busy={busy}><form id="local-login" onSubmit={submit}><label className="field"><span>邮箱</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label><label className="field"><span>密码</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="form-error">{error}</p>}</form></FormSheet>;
}

function asField(row: LocalTrackerRecord): TrackerField {
  return { id: row.serverId ?? 0, trackerId: Number(row.payload.trackerId ?? 0), key: String(row.payload.key), name: String(row.payload.name), type: row.payload.type as TrackerField["type"], required: Boolean(row.payload.required), defaultValue: row.payload.defaultValue ?? null, options: row.payload.options as string[] ?? [], showAfterQuickCapture: Boolean(row.payload.showAfterQuickCapture), includeInStats: Boolean(row.payload.includeInStats), sortOrder: Number(row.payload.sortOrder ?? 0), unit: String(row.payload.unit ?? ""), precision: Number(row.payload.precision ?? 0), config: {}, archivedAt: row.payload.archivedAt as string | null ?? null, createdAt: String(row.payload.createdAt ?? ""), updatedAt: String(row.payload.updatedAt ?? "") };
}
function belongs(row: LocalTrackerRecord, tracker: LocalTrackerRecord) { return row.payload.trackerLocalId === tracker.id || tracker.serverId !== undefined && row.payload.trackerId === tracker.serverId; }

function TrackerWorkspace({ account, platform, onSignIn, onSignOut }: { account: LocalAccount; platform: TrackerPlatform; onSignIn: () => void; onSignOut: () => void }) {
  const store = useMemo(() => new LocalTrackerStore(account.accountId, platform.storage(account)), [account, platform]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [create, setCreate] = useState(false), [capture, setCapture] = useState(false);
  const [editing, setEditing] = useState<LocalTrackerRecord | undefined>(), [deleting, setDeleting] = useState<LocalTrackerRecord | null>(null);
  const [discarding, setDiscarding] = useState<LocalTrackerRecord | null>(null);
  const [query, setQuery] = useState(""), [theme, setTheme] = useState(() => localAppearance().colorTheme);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  async function sync() {
    if (isPreviewAccount(account)) return;
    setSyncing(true);
    try { await store.synchronize(platform.sync); setError(""); setSyncedAt(new Date().toISOString()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法同步，本地记录已保留"); }
    finally { setSyncing(false); }
  }
  useEffect(() => {
    let alive = true;
    store.initialize().then(() => { if (alive) { setReady(true); void sync(); } }).catch(reason => { if (alive) setError(String(reason)); });
    const refresh = () => { if (alive && document.visibilityState !== "hidden") void sync(); };
    window.addEventListener("online", refresh); window.addEventListener("evaorbit:native-active", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("evaorbit:native-active", refresh); document.removeEventListener("visibilitychange", refresh); };
    // The store and account are the lifecycle; edits do not restart the scheduler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  useEffect(() => {
    const apply = () => applyAppearance(localAppearance().appearanceMode, theme, false);
    apply();
    try { localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme); } catch { /* Native records remain in SQLite. */ }
    const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const selected = state.records.find(row => row.id === selectedId && row.resourceType === "tracker");
  const trackers = state.records.filter(row => row.resourceType === "tracker" && !row.payload.archivedAt);
  const hidden = new Set(state.outbox.filter(item => item.operation === "delete").map(item => item.localId));
  const entries = state.records.filter(row => row.resourceType === "tracker_entry" && selected && belongs(row, selected) && !hidden.has(row.id)).sort((a, b) => String(b.payload.occurredAt).localeCompare(String(a.payload.occurredAt)));
  const fields = state.records.filter(row => row.resourceType === "tracker_field" && selected && belongs(row, selected)).map(asField).sort((a, b) => a.sortOrder - b.sortOrder);
  const filtered = entries.filter(row => JSON.stringify([row.payload.note, row.payload.values]).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const issues = state.records.filter(row => row.status);
  async function perform(action: () => Promise<unknown>) { try { await action(); setError(""); void sync(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请重试"); } }
  async function signOut() { try { await platform.signOut(); onSignOut(); } catch (reason) { setError(String(reason)); } }
  function status(row: LocalTrackerRecord) { return row.status ? "需要处理" : state.outbox.some(item => item.localId === row.id) ? "待同步" : "已保存"; }
  function exportLocal() {
    if (platform.native) { void nativeCall("trackers.exportState").catch(reason => setError(String(reason))); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "evaorbit-trackers-local.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="page tracker-page local-trackers">
    <div className="local-tracker-toolbar"><button className="text-button" onClick={selectedId ? () => { setSelectedId(null); setQuery(""); } : () => void signOut()}>{selectedId ? "返回 Trackers" : "退出账户"}</button><select aria-label="颜色主题" value={theme} onChange={event => setTheme(normalizeColorTheme(event.target.value))}>{["editorial", "rosewood", "powderblue", "mistviolet"].map(value => <option key={value}>{value}</option>)}</select><a className="text-button" href="https://eva-orbit.vercel.app/trackers" target="_blank" rel="noreferrer">Web</a></div>
    <header className="page-header"><div><span className="eyebrow">{selected ? String(selected.payload.groupName) : "生活"}</span><h1 className="user-content">{selected ? String(selected.payload.name) : "Trackers"}</h1></div><button className="button primary" disabled={!ready || Boolean(selected?.status) || Boolean(selected?.payload.archivedAt)} onClick={() => { if (selected) { setEditing(undefined); setCapture(true); } else setCreate(true); }}><Icon name="plus" />{selected ? "新增记录" : "新增观测"}</button></header>
    <div className="local-sync-status" role="status"><span>{isPreviewAccount(account) ? "本机预览 · 数据不会上传" : syncing ? "正在同步" : state.outbox.length ? `${state.outbox.length} 项待同步 · 已保存在本机` : syncedAt ? "已同步 · 本机可离线使用" : "本机记录"}</span><button className="text-button" disabled={syncing || !ready || isPreviewAccount(account)} onClick={() => void sync()}>同步</button><button className="text-button" onClick={onSignIn}>连接账户</button><button className="text-button" onClick={exportLocal}>导出本地记录</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {issues.length > 0 && <section className="local-sync-issues" aria-label="同步问题">{issues.map(row => <article key={row.id}>
      <strong>{String(row.payload.name ?? row.payload.note ?? "记录") || "记录"}</strong><p>{row.error}</p>
      <details><summary>查看保留的本地与远端内容</summary><pre>{JSON.stringify({ local: row.payload, remote: row.remote?.payload ?? null }, null, 2)}</pre></details>
      <div className="local-issue-actions"><button className="button secondary" onClick={() => void perform(() => store.resolve(row.id, "local"))}>保留本地并重试</button>
        {row.resourceType === "tracker_entry" && <button className="text-button" onClick={() => {
          const parent = trackers.find(tracker => belongs(row, tracker));
          if (!parent) { setError("所属 Tracker 已删除，可先导出本地内容"); return; }
          setSelectedId(parent.id); setEditing(row); setCapture(true);
        }}>编辑本地记录</button>}
        <button className="text-button" onClick={() => setDiscarding(row)}>{row.remote ? "采用远端" : "放弃本地更改"}</button>
      </div>
    </article>)}</section>}
    {!ready ? <p role="status">正在读取本机记录…</p> : selected ? <section className="tracker-detail-section tracker-timeline-section"><div className="section-heading"><div><h2>全部记录</h2><p>{entries.length} 条记录</p></div></div><div className="tracker-timeline-toolbar"><div className="tracker-search"><Icon name="search" /><input type="search" aria-label="搜索记录" placeholder="搜索备注或属性值" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
      <div className="tracker-entry-list">{filtered.map(row => <article key={row.id}><div className="tracker-entry-time"><time dateTime={String(row.payload.occurredAt)}>{new Date(String(row.payload.occurredAt)).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</time></div><div className="tracker-entry-content"><div className="tracker-entry-values">{Object.entries(row.payload.values as Record<string, unknown> ?? {}).map(([key, value]) => { const field = fields.find(field => field.key === key || String(field.id) === key); return <span key={key} data-wide={field?.type === "text" || field?.type === "time_range"}><small>{field?.name ?? "已归档属性"}</small><strong>{field?.type === "time_range" ? formatTrackerTimeRange(value, false) : Array.isArray(value) ? value.join("、") : typeof value === "boolean" ? value ? "是" : "否" : String(value)}{field?.unit && ` ${field.unit}`}</strong></span>; })}</div>{row.payload.note ? <p className="user-content">{String(row.payload.note)}</p> : null}<small>{status(row)}</small></div><div className="local-record-actions"><button className="text-button" aria-label="编辑记录" disabled={Boolean(row.status)} onClick={() => { setEditing(row); setCapture(true); }}><Icon name="edit" /></button><button className="text-button" aria-label="删除记录" disabled={Boolean(row.status)} onClick={() => setDeleting(row)}><Icon name="trash" /></button></div></article>)}</div>{!filtered.length && <div className="empty-state"><p>{query ? "没有匹配的记录" : "暂无记录，记下第一个时刻。"}</p></div>}</section> : trackers.length ? [...new Set(trackers.map(row => String(row.payload.groupName)))].map(group => <section className="tracker-group" key={group}><div className="tracker-group-heading"><h2>{group}</h2></div><div className="tracker-card-grid">{trackers.filter(row => row.payload.groupName === group).map(row => {
      const last = state.records.filter(entry => entry.resourceType === "tracker_entry" && belongs(entry, row) && !hidden.has(entry.id)).map(entry => String(entry.payload.occurredAt)).sort().at(-1) ?? null;
      return <article className="tracker-card" key={row.id}><button className="local-tracker-card-open" onClick={() => setSelectedId(row.id)}><TrackerCardContent name={String(row.payload.name)} lastOccurredAt={last} picture={<span className="tracker-picture tracker-picture-default"><Icon name="tracker" /></span>} /><small>{status(row)}</small></button></article>;
    })}</div></section>) : <div className="empty-state"><span className="empty-icon"><Icon name="tracker" /></span><h2>暂无观测</h2><button className="button primary" onClick={() => setCreate(true)}>新增观测</button></div>}
    {create && <CreateTracker onClose={() => setCreate(false)} onSave={async (name, groupName, fieldName, type) => {
      const input = parseNewTracker({ name, groupName, quickCaptureEnabled: false });
      const field = fieldName.trim() ? parseNewTrackerField({ name: fieldName, type, key: newTrackerLocalId() }, 1) : undefined;
      const id = await store.createTracker(input, field);
      setSelectedId(id); void sync();
    }} />}
    {capture && selected && <TrackerEntryEditor trackerId={selected.serverId ?? 0} fields={fields} entry={editing ? { id: editing.id, occurredAt: String(editing.payload.occurredAt), values: editing.payload.values as Record<string, unknown>, note: String(editing.payload.note ?? "") } : undefined} onClose={() => setCapture(false)} onSaved={() => { void sync(); }} saveRecord={async input => {
      const parsed = parseNewTrackerEntry(input, selected.serverId ?? 1);
      const payload = { ...parsed, trackerId: selected.serverId, trackerLocalId: selected.id, values: validatedTrackerValues(fields, parsed.values, Boolean(selected.payload.quickCaptureEnabled), Boolean(editing)) };
      if (editing?.status) await store.resolve(editing.id, "local", payload);
      else await store.save("tracker_entry", editing?.id, payload);
    }} />}
    {deleting && <FormSheet title="删除记录" onClose={() => setDeleting(null)}><p>删除这条记录及其备注和属性值？联网后会同步删除。</p><button className="button danger" onClick={() => void perform(async () => { await store.remove(deleting.id); setDeleting(null); })}>确认删除</button></FormSheet>}
    {discarding && <FormSheet title="放弃本地更改" onClose={() => setDiscarding(null)}><p>本地尚未同步的更改会被远端版本替换；远端已删除的记录会从本机移除。可先导出本地记录留存。</p><button className="button danger" onClick={() => void perform(async () => { await store.resolve(discarding.id, "remote"); setDiscarding(null); })}>确认放弃本地更改</button></FormSheet>}
  </main>;
}

function CreateTracker({ onClose, onSave }: { onClose: () => void; onSave: (name: string, group: string, field: string, type: "number" | "text") => Promise<void> }) {
  const [name, setName] = useState(""), [group, setGroup] = useState("日常"), [field, setField] = useState(""), [type, setType] = useState<"number" | "text">("number");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); try { await onSave(name, group, field, type); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setBusy(false); } }
  return <FormSheet title="Create Tracker" onClose={onClose} formId="local-create-tracker" submitLabel="Create Tracker" busy={busy}><form className="editor-card tracker-create-form" id="local-create-tracker" onSubmit={submit}><p className="tracker-create-intro">What do you want to notice?</p><label className="field"><span>Name</span><input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><label className="field"><span>Group</span><input maxLength={60} value={group} onChange={event => setGroup(event.target.value)} /></label><div className="form-grid"><label className="field"><span>记录属性（选填）</span><input maxLength={60} value={field} onChange={event => setField(event.target.value)} /></label><label className="field"><span>类型</span><ChoiceSelect value={type} onChange={event => setType(event.target.value as "number" | "text")}><option value="number">数值</option><option value="text">文本</option></ChoiceSelect></label></div>{error && <p className="form-error" role="alert">{error}</p>}</form></FormSheet>;
}

createRoot(document.getElementById("root")!).render(<App />);
