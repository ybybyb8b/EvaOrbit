"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import type { ApiError, Task, TaskPriority } from "@/lib/types";

type Status = "all" | "open" | "done";
type TaskDraft = { title: string; notes: string; dueDate: string; priority: TaskPriority; tags: string };
const emptyDraft: TaskDraft = { title: "", notes: "", dueDate: "", priority: "medium", tags: "" };

export function TasksView() {
  const params = useSearchParams();
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<Status>(initialStatus === "open" || initialStatus === "done" ? initialStatus : "all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/tasks?status=${status}`);
    setTasks(await response.json());
    setLoading(false);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks?status=${status}`)
      .then((response) => response.json())
      .then((result: Task[]) => {
        if (!cancelled) { setTasks(result); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [status]);

  function startNew() { setEditing(null); setDraft(emptyDraft); setShowMore(false); setError(""); setShowForm(true); }
  function startEdit(task: Task) {
    setEditing(task.id);
    setDraft({ title: task.title, notes: task.notes, dueDate: task.dueDate ?? "", priority: task.priority, tags: task.tags.join(", ") });
    setShowMore(true); setError(""); setShowForm(true);
  }

  function quickDate(kind: "today" | "tomorrow" | "week" | "none") {
    if (kind === "none") { setDraft({ ...draft, dueDate: "" }); return; }
    const value = new Date();
    if (kind === "tomorrow") value.setDate(value.getDate() + 1);
    if (kind === "week") value.setDate(value.getDate() + (7 - (value.getDay() || 7)));
    setDraft({ ...draft, dueDate: value.toLocaleDateString("en-CA") });
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setError(""); setSaving(true);
    const response = await fetch(editing ? `/api/tasks/${editing}` : "/api/tasks", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, dueDate: draft.dueDate || null, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }),
    });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); setSaving(false); return; }
    setShowForm(false); setEditing(null); setDraft(emptyDraft); await load(); setSaving(false);
  }

  async function toggle(task: Task) {
    await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !task.completed }) });
    await load();
  }

  async function remove(task: Task) {
    if (!window.confirm(`删除“${task.title}”？此操作无法撤销。`)) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" }); await load();
  }

  return <div className="page">
    <PageHeader eyebrow="待办" title="待办" action={<button className="button primary" onClick={startNew}><Icon name="plus" />新增待办</button>} />
    {showForm && <FormSheet title={editing ? "改一下" : "记个待办"} onClose={() => setShowForm(false)} formId="task-record-form" submitLabel={editing ? "改好了" : "记下"} busy={saving} busyLabel={editing ? "正在修改…" : "正在保存…"} cancelLabel="先不写"><form id="task-record-form" className="editor-card" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">{editing ? "EDIT" : "NEW"}</span><h2>{editing ? "改一下" : "记个待办"}</h2></div><button type="button" className="text-button" onClick={() => setShowForm(false)}>先不写</button></div>
      <label className="field wide quick-title"><span>要干嘛？</span><input autoFocus required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="先写一件事" /></label>
      <div className="quick-date-field"><span>什么时候</span><div>{([['today','今天'],['tomorrow','明天'],['week','这周'],['none','不设时间']] as const).map(([value,label])=><button type="button" key={value} onClick={()=>quickDate(value)}>{label}</button>)}</div>{draft.dueDate&&<small>现在设为 {draft.dueDate}</small>}</div>
      <button type="button" className="more-toggle" onClick={()=>setShowMore(!showMore)}>{showMore?"收起设置":"更多设置"} <span>›</span></button>
      {showMore && <div className="form-grid advanced-fields">
        <label className="field"><span>截止日期</span><input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
        <label className="field"><span>优先级</span><select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
        <label className="field wide"><span>标签 <small>用逗号分隔</small></span><input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="生活, 本周" /></label>
        <label className="field wide"><span>备注</span><textarea rows={3} maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="补充上下文（可选）" /></label>
      </div>}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit">{editing ? "改好了" : "记下"}</button></div>
    </form></FormSheet>}

    <div className="toolbar"><div className="segmented">{(["all", "open", "done"] as Status[]).map((item) => <button key={item} className={status === item ? "active" : ""} onClick={() => { setLoading(true); setStatus(item); }}>{item === "all" ? "都在这" : item === "open" ? "还没弄" : "搞定了"}</button>)}</div><span className="result-count">{tasks.length} 个</span></div>
    {loading ? <div className="loading-state">在翻待办…</div> : tasks.length ? <div className="task-list">{tasks.map((task) => <article className={`task-row ${task.completed ? "completed" : ""}`} key={task.id}>
      <button className="task-check" onClick={() => toggle(task)} aria-label={task.completed ? "标记为未完成" : "标记为已完成"}><Icon name="check" /></button>
      <div className="task-body"><div className="task-title-line"><h3>{task.title}</h3><span className={`priority-label ${task.priority}`}>{task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}</span></div>{task.notes && <p>{task.notes}</p>}<div className="task-meta">{task.dueDate && <span>{task.dueDate} 截止</span>}{task.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div></div>
      <div className="row-actions"><button onClick={() => startEdit(task)} aria-label="编辑任务"><Icon name="edit" /></button><button className="danger" onClick={() => remove(task)} aria-label="删除任务"><Icon name="trash" /></button></div>
    </article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="check" /></span><h2>{status === "done" ? "暂无已完成待办" : "暂无待办"}</h2>{status !== "done" && <button className="button secondary" onClick={startNew}><Icon name="plus" />新增待办</button>}</div>}
  </div>;
}
