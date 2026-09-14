"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DateTimeField } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { PageHeader } from "@/components/page-header";
import { playNativeHaptic } from "@/lib/native-haptics";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import type { ApiError, Task, TaskPriority } from "@/lib/types";

type Status = "all" | "open" | "done";
type TaskDraft = { title: string; notes: string; dueDate: string; dueTime: string; priority: TaskPriority; tags: string };
const emptyDraft: TaskDraft = { title: "", notes: "", dueDate: "", dueTime: "", priority: "medium", tags: "" };

function localDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function dueLabel(task: Task, english: boolean) {
  if (!task.dueDate) return "";
  const date = new Date(`${task.dueDate}T12:00:00`);
  const label = date.toLocaleDateString(english ? "en-US" : "zh-CN", { month: "short", day: "numeric", year: "numeric" });
  return task.dueTime ? `${label} ${task.dueTime}` : label;
}

export function TasksView() {
  const { english } = useLocale();
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
    if (!response.ok) throw new Error(english ? "Could not load tasks." : "无法载入任务。");
    setTasks(await response.json() as Task[]);
    setLoading(false);
  }, [english, status]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks?status=${status}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Task[]>;
      })
      .then((result) => { if (!cancelled) { setTasks(result); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(english ? "Could not load tasks." : "无法载入任务。"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [english, status]);

  function startNew() { setEditing(null); setDraft(emptyDraft); setShowMore(false); setError(""); setShowForm(true); }
  function startEdit(task: Task) {
    setEditing(task.id);
    setDraft({ title: task.title, notes: task.notes, dueDate: task.dueDate ?? "", dueTime: task.dueTime ?? "", priority: task.priority, tags: task.tags.join(", ") });
    setShowMore(true); setError(""); setShowForm(true);
  }

  function quickDate(kind: "today" | "tomorrow" | "week" | "none") {
    if (kind === "none") { setDraft({ ...draft, dueDate: "", dueTime: "" }); return; }
    if (kind === "week") {
      const value = new Date();
      const offset = 7 - (value.getDay() || 7);
      setDraft({ ...draft, dueDate: localDate(offset) });
      return;
    }
    setDraft({ ...draft, dueDate: localDate(kind === "tomorrow" ? 1 : 0) });
  }

  async function refreshNativeNotifications() {
    try { await reconcileNativeNotifications(); } catch { /* Web Push remains available. */ }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(""); setSaving(true);
    try {
      const response = await fetch(editing ? `/api/tasks/${editing}` : "/api/tasks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, dueDate: draft.dueDate || null, dueTime: draft.dueTime || null, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }),
      });
      const result = await response.json().catch(() => null) as ApiError | null;
      if (!response.ok) throw new Error(english ? "Could not save task." : result?.error ?? "无法保存任务。");
      setShowForm(false); setEditing(null); setDraft(emptyDraft);
      await load(); await refreshNativeNotifications();
      playNativeHaptic("success");
    } catch (reason) {
      playNativeHaptic("error");
      setError(reason instanceof Error ? reason.message : english ? "Could not save task." : "无法保存任务。");
    } finally { setSaving(false); }
  }

  async function toggle(task: Task) {
    const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !task.completed }) });
    if (!response.ok) { playNativeHaptic("error"); return; }
    await load(); await refreshNativeNotifications();
    playNativeHaptic(task.completed ? "selection" : "success");
  }

  async function remove(task: Task) {
    const prompt = english ? `Delete “${task.title}”? This cannot be undone.` : `删除“${task.title}”？此操作无法撤销。`;
    if (!window.confirm(prompt)) return;
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!response.ok) { playNativeHaptic("error"); return; }
    await load(); await refreshNativeNotifications();
  }

  const labels = { all: english ? "All" : "全部", open: english ? "Open" : "未完成", done: english ? "Done" : "已完成" };

  return <div className="page tasks-page">
    <PageHeader eyebrow={english ? "TASKS" : "任务"} title={english ? "Tasks" : "任务"} action={<button className="button primary" onClick={startNew}><Icon name="plus" />{english ? "New task" : "新增任务"}</button>} />
    {showForm && <FormSheet title={editing ? (english ? "Edit task" : "编辑任务") : (english ? "New task" : "新增任务")} onClose={() => setShowForm(false)} formId="task-record-form" submitLabel={editing ? (english ? "Save" : "保存") : (english ? "Add task" : "添加任务")} busy={saving} busyLabel={english ? "Saving…" : "保存中…"} cancelLabel={english ? "Cancel" : "取消"}><form id="task-record-form" className="editor-card" onSubmit={submit}>
      <label className="field wide quick-title"><span>{english ? "Task" : "任务内容"}</span><input autoFocus required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={english ? "What needs to be done?" : "需要做什么？"} /></label>
      <div className="quick-date-field"><span>{english ? "Due" : "截止日期"}</span><div>{([['today',english ? 'Today' : '今天'],['tomorrow',english ? 'Tomorrow' : '明天'],['week',english ? 'This week' : '本周'],['none',english ? 'No due date' : '不设日期']] as const).map(([value,label])=><button type="button" key={value} onClick={()=>quickDate(value)}>{label}</button>)}</div>{draft.dueDate&&<small>{english ? `Due ${draft.dueDate}${draft.dueTime ? ` at ${draft.dueTime}` : ""}` : `截止 ${draft.dueDate}${draft.dueTime ? ` ${draft.dueTime}` : ""}`}</small>}</div>
      <button type="button" className="more-toggle" onClick={()=>setShowMore(!showMore)}>{showMore ? (english ? "Fewer settings" : "收起设置") : (english ? "More settings" : "更多设置")} <span>›</span></button>
      {showMore && <div className="form-grid advanced-fields">
        <DateTimeField label={english ? "Due date" : "截止日期"} optionalDate value={{ date: draft.dueDate, time: draft.dueTime }} onChange={(value) => setDraft({ ...draft, dueDate: value.date, dueTime: value.time })} />
        <label className="field"><span>{english ? "Priority" : "优先级"}</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}><option value="low">{english ? "Low" : "低"}</option><option value="medium">{english ? "Medium" : "中"}</option><option value="high">{english ? "High" : "高"}</option></select></label>
        <label className="field wide"><span>{english ? "Tags" : "标签"} <small>{english ? "Comma separated" : "用逗号分隔"}</small></span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder={english ? "Personal, This week" : "生活, 本周"} /></label>
        <label className="field wide"><span>{english ? "Notes" : "备注"}</span><textarea rows={3} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={english ? "Optional context" : "补充上下文（可选）"} /></label>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form></FormSheet>}

    <div className="toolbar"><div className="segmented">{(["all", "open", "done"] as Status[]).map((item) => <button key={item} className={status === item ? "active" : ""} onClick={() => { setError(""); setLoading(true); setStatus(item); }}>{labels[item]}</button>)}</div><span className="result-count">{english ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}` : `${tasks.length} 项`}</span></div>
    {error && !showForm && <p className="form-error" role="alert">{error}</p>}
    {loading ? <div className="loading-state">{english ? "Loading tasks…" : "正在载入任务…"}</div> : tasks.length ? <div className="task-list">{tasks.map((task) => {
      const due = dueLabel(task, english);
      return <article className={`task-row ${task.completed ? "completed" : ""}`} key={task.id}>
        <button type="button" className="task-check" onClick={() => void toggle(task)} aria-label={task.completed ? (english ? "Mark as open" : "标记为未完成") : (english ? "Mark as done" : "标记为已完成")}><Icon name="check" /></button>
        <div className="task-body"><div className="task-title-line"><h3>{task.title}</h3><span className={`priority-label ${task.priority}`}>{task.priority === "high" ? (english ? "High" : "高") : task.priority === "medium" ? (english ? "Med" : "中") : (english ? "Low" : "低")}</span></div>{task.notes && <p>{task.notes}</p>}{(due || task.tags.length > 0) && <div className="task-meta">{due && <time dateTime={`${task.dueDate}${task.dueTime ? `T${task.dueTime}` : ""}`}>{english ? `Due ${due}` : `${due} 截止`}</time>}{task.dueTime && <span className="task-reminder-state"><Icon name="notifications" variant="stroke" />{english ? "Reminder" : "提醒"}</span>}{task.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div>}</div>
        <div className="row-actions"><button type="button" onClick={() => startEdit(task)} aria-label={english ? "Edit task" : "编辑任务"}><Icon name="edit" /></button><button type="button" className="danger" onClick={() => void remove(task)} aria-label={english ? "Delete task" : "删除任务"}><Icon name="trash" /></button></div>
      </article>;
    })}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="check" /></span><h2>{status === "done" ? (english ? "No completed tasks" : "暂无已完成任务") : (english ? "No tasks yet" : "暂无任务")}</h2>{status !== "done" && <button className="button secondary" onClick={startNew}><Icon name="plus" />{english ? "New task" : "新增任务"}</button>}</div>}
  </div>;
}
