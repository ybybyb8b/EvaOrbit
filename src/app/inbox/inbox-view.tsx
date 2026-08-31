"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icons";
import type { ApiError, InboxItem, InboxStatus } from "@/lib/types";

const filters = [["inbox", "没整理"], ["processed", "处理过"], ["archived", "归档"], ["all", "全部"]] as const;
const statusLabels: Record<InboxStatus, string> = { inbox: "没整理", processed: "处理过", archived: "已归档" };

export function InboxView() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [status, setStatus] = useState<InboxStatus | "all">("inbox");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/inbox?status=${status}`);
    setItems(response.ok ? await response.json() : []);
    setLoading(false);
  }, [status]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, source: "manual" }) });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    setContent("");
    setStatus("inbox");
    await load();
  }

  async function patch(id: number, body: object) {
    await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("删掉这条临时记录？")) return;
    await fetch(`/api/inbox/${id}`, { method: "DELETE" });
    await load();
  }

  return <div className="page inbox-page">
    <PageHeader eyebrow="SPACE" title="Inbox" description="随便丢进来，不用现在整理。" />
    <form className="capture-card inbox-capture" onSubmit={submit}>
      <textarea autoFocus required rows={3} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={"脑子里刚冒出来什么？\n随便写，不用整理"} />
      <div>{error && <p className="form-error">{error}</p>}<button className="button primary" type="submit">先放这里</button></div>
    </form>
    <div className="toolbar inbox-toolbar">
      <div className="segmented" aria-label="Inbox 状态筛选">{filters.map(([value, label]) => <button className={status === value ? "active" : ""} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} key={value}>{label}</button>)}</div>
      <span className="result-count">{items.length} 条</span>
    </div>
    {loading ? <div className="loading-state">在翻 Inbox…</div> : items.length ? <div className="inbox-list">{items.map((item) => <article className="inbox-row" key={item.id}>
      <p>{item.content}</p>
      <div className="inbox-row-footer">
        <div className="inbox-meta"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN")}</time><span>{statusLabels[item.status]}</span>{item.convertedType && <span>旧版已转为 {item.convertedType}</span>}</div>
        <div className="row-actions">
          {item.status === "inbox" && <><button type="button" onClick={() => patch(item.id, { status: "processed" })}>处理好了</button><button type="button" onClick={() => patch(item.id, { status: "archived" })}>归档</button></>}
          {item.status !== "inbox" && <button type="button" onClick={() => patch(item.id, { status: "inbox" })}>放回未整理</button>}
          <button className="danger inbox-delete" type="button" aria-label="删除这条 Inbox" title="删除" onClick={() => remove(item.id)}><Icon name="trash" /></button>
        </div>
      </div>
    </article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="check" /></span><h2>这里空着</h2><p>脑子也可以暂时空着。</p></div>}
  </div>;
}
