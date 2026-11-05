"use client";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ComponentProps } from "react";
import { useBusinessRequest } from "./business-request-context";
import { useEvaActivity } from "./eva-activity";
import { EvaFeedbackDetails } from "./eva-feedback-details";
import { useFormPreview } from "./form-preview";
import { useLocale } from "./locale-controller";
import { ErrorNotice } from "./error-notice";
import { EvaPaperSheet } from "./eva-paper";
import { responseError } from "@/lib/response-error";
import type { EvaCall, EvaJob, EvaSettings, EvaStatus } from "@/lib/eva";
import styles from "./eva.module.css";
import { clearClientJsonCache } from "@/lib/client-json-cache";
import { dataChangedEvent } from "@/lib/data-changed";

type Data = { settings: EvaSettings; jobs: EvaJob[]; calls: EvaCall[] };
type LinkProps = ComponentProps<"a"> & { href: string };
const Anchor = (props: LinkProps) => <a {...props} />;
const statusNames: Record<EvaStatus, [string, string]> = { held: ["In Inbox", "留在散落"], queued: ["Waiting", "等 Eva 整理"], running: ["Sorting", "整理中"], review: ["Needs a look", "等你看一眼"], done: ["Sorted", "已整理"], failed: ["Not sorted yet", "这次没整理好"] };

export function EvaWorkbench({ LinkComponent = Anchor }: { LinkComponent?: ComponentType<LinkProps> }) {
  const request = useBusinessRequest(), readonly = useFormPreview(), { english } = useLocale();
  const activity = useEvaActivity();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState("");
  const [paper, setPaper] = useState(false), [tab, setTab] = useState<"activity" | "usage">("activity"), [period, setPeriod] = useState<"day" | "month">("day");
  const [busy, setBusy] = useState(false), [correction, setCorrection] = useState<{ id: string; text: string } | null>(null);
  const lock = useRef(false);
  const latest = useRef<Data | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const t = (en: string, zh: string) => english ? en : zh;
  const load = useCallback(async (signal?: AbortSignal) => {
    if (readonly) return;
    const response = await request("/api/eva", { cache: "no-store", signal });
    if (!response.ok) throw new Error(await responseError(response, english ? "Could not load Eva. Try again." : "未能读取 Eva，请重试。"));
    const value = await response.json() as Data;
    if (!signal?.aborted) {
      if (latest.current && value.jobs.some(job => job.taskIds.some(Boolean) && latest.current?.jobs.find(old => old.id === job.id)?.updatedAt !== job.updatedAt)) {
        clearClientJsonCache(); window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains: ["tasks", "reminders"], source: "eva" } }));
      }
      latest.current = value; setData(value); setLoadedAt(Date.now()); setError("");
    }
  }, [request, readonly, english]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState !== "hidden") void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : english ? "Could not load Eva." : "未能读取 Eva。"); }); };
    refresh();
    const interval = setInterval(() => { if (latest.current?.jobs.some(j => j.status === "queued" || j.status === "running")) refresh(); }, 10000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [load, english]);
  async function act(body: object) {
    if (readonly || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const operation = body as { action?: string; id?: string };
    const trackedId = ["retry", "revise"].includes(operation.action ?? "") ? operation.id : undefined;
    if (trackedId) activity?.begin(trackedId);
    let rejected = false, accepted = false;
    try {
      const r = await request("/api/eva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { rejected = [400, 401, 403, 404, 405, 409, 413, 422].includes(r.status); throw new Error(await responseError(r, t("Could not complete this action.", "操作未完成，请重试。"))); }
      if (trackedId) activity?.accepted(await r.json() as EvaJob);
      accepted = true;
      setCorrection(null); await load();
    } catch (e) { const message = e instanceof Error ? e.message : t("Could not complete this action.", "操作未完成，请重试。"); setError(message); if (trackedId && !accepted) activity?.failed(trackedId, message, rejected); }
    finally { lock.current = false; setBusy(false); }
  }
  const calls = data?.calls ?? [];
  const grouped = new Map<string, { input: number; output: number; cached: number; missingCache: number; unknown: number; cost: number; missingCost: number; count: number; currency: string }>();
  for (const call of calls) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(call.createdAt));
    const label = period === "day" ? date : date.slice(0, 7), currency = call.currency ?? "—", key = `${label}|${call.model}|${currency}`;
    const row = grouped.get(key) ?? { input: 0, output: 0, cached: 0, missingCache: 0, unknown: 0, cost: 0, missingCost: 0, count: 0, currency };
    row.input += call.input ?? 0; row.output += call.output ?? 0; row.cached += call.cached ?? 0; row.unknown += call.input === null || call.output === null ? 1 : 0;
    row.missingCache += call.cached === null ? 1 : 0; row.cost += call.cost ?? 0; row.missingCost += call.cost === null ? 1 : 0; row.count++; grouped.set(key, row);
  }
  return <div className={`page ${styles.workbench}`}>
    <header className={styles.heading}><div><h1>Eva</h1><p>{t("Your papers.", "纸条与待办。")}</p></div>
      <label className={styles.switch}><input type="checkbox" role="switch" aria-label={t("Eva background sorting", "Eva 后台整理")} checked={data?.settings.enabled ?? false} disabled={busy || readonly || !data} onChange={e => void act({ action: "settings", enabled: e.target.checked })} /><span>{data?.settings.enabled ? t("Eva is on", "Eva 已开启") : t("Eva is off", "Eva 已关闭")}</span></label>
    </header>
    <div className={styles.toolbar}><div className={styles.tabs}><button aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>{t("Papers", "纸条与整理")}</button><button aria-pressed={tab === "usage"} onClick={() => setTab("usage")}>{t("Usage & cost", "用量与费用")}</button></div><button className="button primary" onClick={() => setPaper(true)}>{t("Leave a paper", "放一张纸条")}</button></div>
    {readonly && <p>{t("Connect your account to use Eva.", "连接账户后可以使用 Eva。")}</p>}
    {error && <><ErrorNotice>{error}</ErrorNotice><button className="text-button" onClick={() => void load().catch(e => setError(String(e)))}>{t("Reload", "重新读取")}</button></>}
    {!data && !readonly && !error && <p role="status">{t("Opening your papers…", "正在打开纸条……")}</p>}
    {tab === "activity" && <>
      {data?.jobs.some(j => j.status === "queued" || j.status === "running" && Date.parse(j.leaseUntil ?? "") < loadedAt) && <p className={styles.hint}>{t("Waiting papers can resume if a background run was interrupted.", "后台曾中断的纸条可以继续整理。暂时关闭页面也没关系。")} <button className="text-button" disabled={busy || !data.settings.enabled} onClick={() => void act({ action: "resume" })}>{t("Continue sorting", "继续整理")}</button></p>}
      {data && !data.jobs.length && <div className={styles.empty}><h2>{t("No papers yet.", "还没有纸条。")}</h2><p>{t("Leave a paper whenever you need.", "想到什么，放在这里就好。")}</p><LinkComponent href="/settings/ai-connection">{t("Configure a model", "配置使用的模型")}</LinkComponent></div>}
      <div className={styles.stack}>{data?.jobs.map(job => <article key={job.id} className={styles.paper}>
        <div className={styles.paperHeader}><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString(english ? "en-US" : "zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span role={job.status === "running" ? "status" : undefined}>{job.status === "done" && !job.result ? t("Saved", "收好了") : statusNames[job.status][english ? 0 : 1]}</span></div>
        <p className={styles.original}>{job.content}</p>
        {job.context.length > 0 && <details><summary>{t("Your clarifications", "你的补充")}</summary>{job.context.map((text, i) => <p key={i}>{text}</p>)}</details>}
        {job.result && <><p>{job.result.summary}</p><ul>{job.result.tasks.map((task, i) => <li key={i}>{job.taskIds[i] ? <LinkComponent href={`/tasks?taskId=${job.taskIds[i]}`}>{task.title}</LinkComponent> : <strong>{task.title} · {t("Suggested", "待确认")}</strong>}<small>{[task.dueDate, task.dueTime, task.remind ? t("Reminder", "提醒") : ""].filter(Boolean).join(" · ") || t("No date set", "未设日期")}</small>{task.notes && <small>{task.notes}</small>}</li>)}</ul>{job.result.remaining && <p className={styles.hint}>{t("Stays in Inbox: ", "留在散落：")}{job.result.remaining}</p>}</>}
        {(job.feedback || job.error) && <EvaFeedbackDetails job={job} />}
        <div className={styles.actions}>
          {job.status === "review" && <button className="button primary" disabled={busy} onClick={() => void act({ action: "approve", id: job.id })}>{t("Create remaining tasks", "确认创建余下待办")}</button>}
          {["held", "failed"].includes(job.status) && <button className="text-button" disabled={busy || !data.settings.enabled || job.attempts >= 10} onClick={() => void act({ action: "retry", id: job.id })}>{t("Send to Eva", "交给 Eva")}</button>}
          {["review", "failed"].includes(job.status) && !job.taskIds.some(Boolean) && <button className="text-button" disabled={busy || !data.settings.enabled} onClick={() => setCorrection({ id: job.id, text: "" })}>{t("Clarify this paper", "补充这张纸条")}</button>}
          {["held", "review", "failed", "queued"].includes(job.status) && <button className="text-button" disabled={busy} onClick={() => void act({ action: "keep", id: job.id })}>{t("Keep in Inbox", "留在散落")}</button>}
          <LinkComponent href="/inbox">{t("Inbox", "散落")}</LinkComponent>
        </div>
        {correction?.id === job.id && <form onSubmit={e => { e.preventDefault(); void act({ action: "revise", id: job.id, instruction: correction.text }); }}><label className="field"><span>{t("Clarification for this paper only", "只补充当前这张纸条")}</span><textarea className={styles.correction} autoFocus required maxLength={1500} value={correction.text} onChange={e => setCorrection({ id: job.id, text: e.target.value })} /></label><div className={styles.actions}><button className="button primary" disabled={busy || !correction.text.trim()}>{t("Sort again", "重新整理")}</button><button className="text-button" type="button" onClick={() => setCorrection(null)}>{t("Cancel", "取消")}</button></div></form>}
      </article>)}</div>
    </>}
    {tab === "usage" && <><p className={styles.hint}>{t("At most one model call per paper attempt. No global chat history or tool catalogue. Unreported usage and unpriced costs stay unknown; costs use the saved rate, not a provider invoice.", "每次整理至多一次模型调用，不携带全局聊天历史或工具清单。用量缺失、价格未配置时显示未知；费用按当次保存的价格估算，不等同于供应商账单。")}</p><div className={styles.toolbar}><div className="segmented"><button aria-pressed={period === "day"} onClick={() => setPeriod("day")}>{t("Daily", "按日")}</button><button aria-pressed={period === "month"} onClick={() => setPeriod("month")}>{t("Monthly", "按月")}</button></div><LinkComponent href="/settings/ai-connection">{t("Model settings", "模型设置")}</LinkComponent></div>
      {!calls.length ? <p>{t("No processing attempts yet.", "还没有处理尝试。")}</p> : <div className={styles.usage}><table><thead><tr>{[t("Period / model", "日期／模型"), t("Calls", "次数"), t("Input", "输入"), t("Output", "输出"), t("Cached", "缓存"), t("Est. cost", "估算费用")].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{[...grouped].map(([key, row]) => <tr key={key}><td>{key.split("|").slice(0, 2).join(" · ")}</td><td>{row.count}</td><td>{row.unknown ? `${row.input}+?` : row.input}</td><td>{row.unknown ? `${row.output}+?` : row.output}</td><td>{row.cached}{row.missingCache ? "+?" : ""}</td><td>{row.missingCost === row.count ? t("Unknown", "未知") : `${row.currency} ${row.cost.toFixed(6)}${row.missingCost ? " + ?" : ""}`}</td></tr>)}</tbody></table></div>}
      <details className={styles.pricing}><summary>{t("Optional model pricing", "配置模型计价（可选）")}</summary><p className={styles.hint}>{t("Price per million tokens. Applies to future calls of this exact model; historical prices stay unchanged.", "每百万 Token 的价格。仅用于此模型之后的调用，历史价格不改写。")}</p><form onSubmit={e => { e.preventDefault(); const fields = new FormData(e.currentTarget); void act({ action: "settings", pricing: { model: String(fields.get("model")), currency: String(fields.get("currency")), input: Number(fields.get("input")), output: Number(fields.get("output")), cachedInput: Number(fields.get("cached")), version: new Date().toISOString() } }); }}>
        <label>{t("Exact model ID", "准确模型 ID")}<input name="model" required maxLength={200} defaultValue={data?.settings.pricing?.model ?? ""} /></label><label>{t("Currency", "币种")}<select name="currency" defaultValue={data?.settings.pricing?.currency ?? "CNY"}><option>CNY</option><option>USD</option></select></label>
        {([['input', t("Input", "输入"), 'input'], ['output', t("Output", "输出"), 'output'], ['cached', t("Cached input", "缓存输入"), 'cachedInput']] as const).map(([name, label, field]) => <label key={name}>{label}<input type="number" name={name} required min={0} max={10000} step="any" defaultValue={data?.settings.pricing?.[field] ?? ""} /></label>)}<button className="button secondary" disabled={busy || readonly}>{t("Save pricing", "保存价格")}</button>
      </form></details></>}
    {paper && <EvaPaperSheet onClose={() => setPaper(false)} onSaved={() => load()} />}
  </div>;
}
