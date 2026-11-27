"use client";
import { Disclosure } from "@/components/disclosure";
import {useWorkspaceData} from "@/components/workspace-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";

import { ErrorNotice } from "@/components/error-notice";
import { useSectionSwipe } from "@/components/use-section-swipe";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";
import {TaskEditor,emptyTaskDraft,type TaskDraft} from "./task-editor";
import { parseInputTags } from "@/lib/form-input";
import { showActionToast } from "@/components/action-toast";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { currentLocalDate } from "@/components/date-time-field";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { PageLoading } from "@/components/page-loading";
import { playNativeHaptic } from "@/lib/native-haptics";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { groupTasks, taskCalendarDates, taskDateOffset, type TaskGroup } from "@/lib/task-groups";
import { dateInEvaOrbit } from "@/lib/time";
import type { ApiError, Task } from "@/lib/types";
import styles from "./task-editor.module.css";

type Status = "all" | "open" | "done";
const sections = ["list", "month"] as const;

function dueLabel(task: Task, english: boolean) {
  if (!task.dueDate) return "";
  const date = new Date(`${task.dueDate}T12:00:00`);
  const label = date.toLocaleDateString(english ? "en-US" : "zh-CN", { month: "short", day: "numeric", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}) });
  return task.dueTime ? `${label} ${task.dueTime}` : label;
}

export function TasksContent({params}:{params:Pick<URLSearchParams,"get">}) {
  const {read}=useWorkspaceData(),preview=useFormPreview();
  const { english } = useLocale();
  const taskId = params.get("taskId");
  const openedTask = useRef<string | null>(null);
  const swipeRoot=useRef<HTMLDivElement>(null),swipeNav=useRef<HTMLDivElement>(null);
  const initialStatus = params.get("status");
  const [status, setStatus] = useRememberedState<Status>("TasksView:status", initialStatus === "open" || initialStatus === "done" ? initialStatus : "all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTag, setSelectedTag] = useRememberedState<string | null>("TasksView:selectedTag", null);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [view, setView] = useRememberedState<"list" | "month">("TasksView:view", "list");
  const [dateScope, setDateScope] = useRememberedState<string>("TasksView:dateScope", initialStatus || taskId ? "all" : "today");
  const [period, setPeriod] = useRememberedState<string>("TasksView:period", "today");


  useEffect(() => {
    const update = () => setClock(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

  const startEdit = useCallback((task: Task) => {
    const reminder=task.reminders?.[0];
    setEditing(task.id);
    setDraft({title:task.title,notes:task.notes,dueDate:task.dueDate??"",dueTime:task.dueTime??"",completedOn:task.completed?(task.completedOn??(task.completedAt?dateInEvaOrbit(new Date(task.completedAt)):"")):undefined,reminderMode:reminder?(reminder.triggerType==="absolute"?"custom":"at_due"):"none",reminderDate:reminder?.absoluteDate??"",reminderTime:reminder?.absoluteTime??"",repeatWhileOverdue:reminder?.repeatWhileOverdue??false,priority:task.priority,tags:task.tags.join(", ")});
    setError(""); setShowForm(true);
  }, []);


  const load = useCallback(async () => {
    const response = await read("/api/tasks?status=all");
    if (!response.ok) throw new Error(english ? "Could not load tasks." : "无法载入任务。");
    setTasks(await response.json() as Task[]);
    setLoading(false);
  }, [english,read]);
  useDataRefresh("/tasks", () => load());

  useEffect(() => {
    let cancelled = false;
    read("/api/tasks?status=all")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Task[]>;
      })
      .then((result) => { if (!cancelled) { setTasks(result); setLoading(false); if (taskId && openedTask.current !== taskId) { openedTask.current = taskId; const task = result.find(item => String(item.id) === taskId); if (task) startEdit(task); else setError(english ? "Task not found." : "找不到这条任务。"); } } })
      .catch(() => { if (!cancelled) { setError(english ? "Could not load tasks." : "无法载入任务。"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [english, taskId, startEdit,read]);

  function startNew(dueDate = "") { setEditing(null); setDraft({ ...emptyTaskDraft, dueDate, tags: activeTag ?? "" }); setError(""); setShowForm(true); }

  async function refreshNativeNotifications() {
    if(preview)return;
    try { await reconcileNativeNotifications(); } catch { /* Web Push remains available. */ }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();if(preview)return;
    if (preview||saving) return;
    setError(""); setSaving(true);
    try {
      const response = await read(editing ? `/api/tasks/${editing}` : "/api/tasks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...draft,dueDate:draft.dueDate||null,dueTime:draft.dueTime||null,reminderDate:draft.reminderDate||null,reminderTime:draft.reminderTime||null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Shanghai",tags:parseInputTags(draft.tags)}),
      });
      const result = await response.json().catch(() => null) as ApiError | null;
      if (!response.ok) throw new Error(english ? "Could not save task." : result?.error ?? "无法保存任务。");
      setShowForm(false); setEditing(null); setDraft(emptyTaskDraft);
      if (!editing) showActionToast(english ? "Task added" : "任务已添加");
      await load(); await refreshNativeNotifications();
      playNativeHaptic("success");
    } catch (reason) {
      playNativeHaptic("error");
      setError(reason instanceof Error ? reason.message : english ? "Could not save task." : "无法保存任务。");
    } finally { setSaving(false); }
  }

  async function toggle(task: Task) {
    if (preview||busyTaskId !== null) return;
    setBusyTaskId(task.id); setError("");
    try {
      const response = await read(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !task.completed }) });
      if (!response.ok) throw new Error(english ? "Could not update task." : "无法更新任务。");
      await load(); await refreshNativeNotifications();
      playNativeHaptic(task.completed ? "selection" : "success");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : english ? "Could not update task." : "无法更新任务。");
      playNativeHaptic("error");
    } finally { setBusyTaskId(null); }
  }

  async function remove(task: Task) {
    if (saving) return;
    const prompt = english ? `Delete “${task.title}”? This cannot be undone.` : `删除“${task.title}”？此操作无法撤销。`;
    if (!window.confirm(prompt)) return;
    setSaving(true); setError("");
    try {
      const response = await read(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(english ? "Could not delete task." : "无法删除任务。");
      setShowForm(false); setEditing(null);
      await load(); await refreshNativeNotifications();
      showActionToast(english ? "Task deleted" : "任务已删除", "deleted");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : english ? "Could not delete task." : "无法删除任务。");
      playNativeHaptic("error");
    } finally { setSaving(false); }
  }

  const labels = { all: english ? "All" : "全部", open: english ? "Open" : "未完成", done: english ? "Done" : "已完成" };
  const today = currentLocalDate();
  const now = clock ?? new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tags = [...new Set(tasks.flatMap(task => task.tags))].sort((a, b) => a.localeCompare(b));
  const activeTag = selectedTag && tags.includes(selectedTag) ? selectedTag : null;
  const activeDate = dateScope === "today" ? today : dateScope === "all" || dateScope === "undated" ? null : dateScope;
  const selectedDueDate = dateScope === "today" ? "" : activeDate ?? "";
  useSectionSwipe({active:view,sections,rootRef:swipeRoot,feedbackRef:swipeNav,onChange:mode=>{setView(mode);setPeriod(activeDate??today);},enabled:!showForm,ignoreSelector:".task-calendar-controls, .task-filter-bar, .task-status-tabs, .task-week-strip",interactiveSurfaceSelector:".task-month-day"});
  const taggedTasks = tasks.filter(task => !activeTag || task.tags.includes(activeTag));
  const scopeTasks = taggedTasks.filter(task => dateScope === "all" || (dateScope === "undated" ? !task.dueDate : task.dueDate === activeDate || (activeDate === today && !task.completed && task.dueDate && task.dueDate < today)));
  const visibleTasks = scopeTasks.filter(task => status === "all" || task.completed === (status === "done"));
  const calendarTasks = taggedTasks.filter(task => status === "all" || task.completed === (status === "done"));
  const anchor = period === "today" ? today : period;
  const dates = taskCalendarDates(anchor, view);
  const locale = english ? "en-US" : "zh-CN";
  const dayDate = activeDate ? new Date(`${activeDate}T12:00:00`) : null;
  const groups = groupTasks(visibleTasks, today, time);
  const groupLabels: Record<TaskGroup, string> = { overdue: english ? "Overdue" : "逾期", today: english ? "Today" : "今天", upcoming: english ? "Coming up" : "接下来", unscheduled: english ? "No date" : "未设日期", completed: english ? "Completed" : "已完成" };
  const statusCounts = { all: scopeTasks.length, open: scopeTasks.filter(task => !task.completed).length, done: scopeTasks.filter(task => task.completed).length };
  const editingTask = tasks.find(task => task.id === editing);

  function movePeriod(direction: number) {
    if (view === "list") {
      setPeriod(taskDateOffset(anchor, direction * 7));
      if (activeDate) setDateScope(taskDateOffset(activeDate, direction * 7));
    }
    else {
      const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00`);
      date.setMonth(date.getMonth() + direction);
      const first = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
      setPeriod(first); setDateScope(first);
    }
  }

  function renderTask(task: Task) {
    const due = dueLabel(task, english), reminder = task.reminders?.[0];
    const completedOn = task.completed ? task.completedOn ?? (task.completedAt ? dateInEvaOrbit(new Date(task.completedAt)) : null) : null;
    return <article className={`task-row ${task.completed ? "completed" : ""}`} key={task.id}>
      <button type="button" className="task-check" disabled={preview||busyTaskId !== null} aria-pressed={task.completed} aria-busy={busyTaskId === task.id} onClick={() => void toggle(task)} aria-label={task.completed ? (english ? `Reopen ${task.title}` : `重新打开：${task.title}`) : (english ? `Complete ${task.title}` : `完成：${task.title}`)}><Icon name="check" /></button>
      <button type="button" className="task-body task-open" onClick={() => startEdit(task)} aria-label={english ? `Edit ${task.title}` : `编辑：${task.title}`}>
        <span className="task-title-line"><span className="task-title">{task.title}</span>{task.priority === "high" && <span className="priority-label high">{english ? "High" : "高优先级"}</span>}</span>
        {(completedOn || due || reminder || task.notes || task.tags.length > 0) && <span className="task-meta">{completedOn ? <time dateTime={completedOn}>{english?"Done":"完成"} {completedOn}</time> : due && (task.dueDate !== activeDate || task.dueTime) && <time dateTime={`${task.dueDate}${task.dueTime ? `T${task.dueTime}` : ""}`}>{task.dueDate === activeDate ? task.dueTime : due}</time>}{task.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}{reminder && <span className="task-reminder-state" title={reminder.triggerType === "absolute" ? `${reminder.absoluteDate} ${reminder.absoluteTime}` : (english ? "At due time" : "截止时提醒")}><Icon name="notifications" variant="stroke" /><span className="sr-only">{english ? "Reminder set" : "已设置提醒"}</span></span>}{task.notes && <span className="task-note-indicator" title={task.notes}><Icon name="memory" variant="stroke" /><span className="sr-only">{english ? "Has notes" : "有备注"}</span></span>}</span>}
      </button>
    </article>;
  }

  return <div ref={swipeRoot} className="page tasks-page">
    <PageHeader eyebrow={english ? "TASKS" : "任务"} title={english ? "Tasks" : "任务"} description={english ? "A little space for what comes next." : "把想做的事，慢慢变成做好的事。"} action={<PageLogAction label="新增待办" className="button primary" onClick={() => startNew(selectedDueDate)}><Icon name="plus" />{english ? "New task" : "新增任务"}</PageLogAction>} />
    {showForm && <FormSheet title={editing ? (english ? "Edit task" : "编辑任务") : (english ? "New task" : "新增任务")} onClose={() => setShowForm(false)} formId="task-record-form" submitLabel={editing ? (english ? "Save" : "保存") : (english ? "Add task" : "添加任务")} busy={saving} submitDisabled={preview} busyLabel={english ? "Saving…" : "保存中…"} cancelLabel={english ? "Cancel" : "取消"}><form id="task-record-form" className={`editor-card field-focus-surface ${styles.editor}`} onSubmit={submit}>{preview&&<FormPreviewNotice/>}
      <TaskEditor draft={draft} setDraft={setDraft} tags={tags}/>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      {editingTask && <button type="button" className="task-delete-button" disabled={preview||saving} onClick={() => void remove(editingTask)}><Icon name="trash" />{english ? "Delete task" : "删除这条任务"}</button>}
    </form></FormSheet>}

    <div className="task-planner">
      <header className="task-calendar-controls">
        <div className="task-period-navigation"><button type="button" className="icon-button task-period-previous" onClick={() => movePeriod(-1)} aria-label={english ? (view === "list" ? "Previous week" : "Previous month") : (view === "list" ? "上一周" : "上个月")}><Icon name="arrow" /></button><h2>{clock && new Date(`${anchor}T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" })}</h2><button type="button" className="icon-button" onClick={() => movePeriod(1)} aria-label={english ? (view === "list" ? "Next week" : "Next month") : (view === "list" ? "下一周" : "下个月")}><Icon name="arrow" /></button></div>
        <div className="task-calendar-actions"><button type="button" className="task-today-button" onClick={() => { setPeriod("today"); setDateScope("today"); }}>{english ? "Today" : "今天"}</button><div ref={swipeNav} className="task-view-switch" aria-label={english ? "Task view" : "任务视图"}>{sections.map(mode => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); setPeriod(activeDate ?? today); }}><Icon name={mode === "list" ? "tasks" : "calendar"} variant="stroke" />{mode === "list" ? (english ? "List" : "列表") : (english ? "Month" : "月历")}</button>)}</div></div>
      </header>
      {clock && view === "list" && <nav className="task-week-strip" aria-label={english ? "Choose a due date" : "选择截止日期"}>{dates.map(date => {
        const value = new Date(`${date}T12:00:00`), count = calendarTasks.filter(task => task.dueDate === date).length;
        return <button type="button" key={date} aria-pressed={activeDate === date} aria-current={date === today ? "date" : undefined} onClick={() => setDateScope(date)} aria-label={`${value.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" })}${english ? `, ${count} tasks` : `，${count} 项任务`}`}><span>{value.toLocaleDateString(locale, { weekday: "short" })}</span><strong>{value.getDate()}</strong><span className="task-day-count">{count ? (english ? `${count} tasks` : `${count} 项`) : "·"}</span></button>;
      })}</nav>}
      <div className="task-filter-bar"><div className="task-date-scopes"><button type="button" aria-pressed={dateScope === "all"} onClick={() => setDateScope("all")}>{english ? "All dates" : "全部日期"}</button><button type="button" aria-pressed={dateScope === "undated"} onClick={() => setDateScope("undated")}>{english ? "No date" : "未设日期"}<span>{taggedTasks.filter(task => !task.dueDate).length}</span></button></div>{tags.length > 0 && <nav className="task-tag-filters" aria-label={english ? "Filter by tag" : "按标签筛选"}><div><button type="button" aria-pressed={!activeTag} onClick={() => setSelectedTag(null)}>{english ? "All tags" : "全部标签"}</button>{tags.map(tag => <button type="button" key={tag} aria-pressed={activeTag === tag} onClick={() => setSelectedTag(activeTag === tag ? null : tag)}><i aria-hidden="true" /><span className="task-tag-name">{tag}</span></button>)}</div></nav>}</div>
      <div className={`task-workspace ${view === "month" ? "task-workspace-month" : ""}`}>
      {clock && view === "month" && <div className="task-month"><div className="task-month-weekdays">{dates.slice(0, 7).map(date => <span key={date}>{new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: "short" })}</span>)}</div><div className="task-month-grid">{dates.map(date => {
        const dayTasks = calendarTasks.filter(task => task.dueDate === date), value = new Date(`${date}T12:00:00`);
        return <button type="button" className={`task-month-day ${date.slice(0, 7) !== anchor.slice(0, 7) ? "outside-month" : ""}`} key={date} aria-pressed={activeDate === date} aria-current={date === today ? "date" : undefined} onClick={() => setDateScope(date)} aria-label={`${value.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" })}${english ? `, ${dayTasks.length} tasks` : `，${dayTasks.length} 项任务`}`}><span className="task-month-number">{value.getDate()}</span><span className="task-month-tasks">{dayTasks.slice(0, 2).map(task => <span className={`${task.completed ? "completed" : ""} ${task.priority === "high" ? "high" : ""}`} key={task.id}>{task.title}</span>)}{dayTasks.length > 2 && <span className="task-month-more">+{dayTasks.length - 2}</span>}</span>{dayTasks.length > 0 && <span className="task-month-count">{dayTasks.length}</span>}</button>;
      })}</div><p className="task-calendar-caption">{english ? "Tasks appear on their due date." : "按截止日期显示任务"}</p></div>}
      <div className="task-agenda">
        <div className="task-agenda-heading"><div><h2>{activeDate === today ? (english ? "Today’s tasks" : "今天的任务") : dayDate ? dayDate.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "short" }) : dateScope === "undated" ? (english ? "No date yet" : "还未安排日期") : (english ? "All your tasks" : "所有任务")}</h2><p>{!loading && (english ? `${statusCounts.open} to do · ${statusCounts.done} completed` : `${statusCounts.open} 项待办 · ${statusCounts.done} 项已完成`)}{activeDate === today && groups.overdue.length > 0 && (english ? " · includes overdue tasks" : " · 含逾期任务")}</p></div><div className="segmented task-status-tabs">{(["all", "open", "done"] as Status[]).map(item => <button type="button" key={item} className={status === item ? "active" : ""} aria-pressed={status === item} onClick={() => setStatus(item)}>{labels[item]}</button>)}</div></div>
        {error && !showForm && <ErrorNotice role="alert">{error}</ErrorNotice>}
        {loading ? <PageLoading title="任务" englishTitle="tasks" inline /> : visibleTasks.length ? <>
          {(["overdue", "today", "upcoming", "unscheduled"] as const).map(group => groups[group].length > 0 && <section className={`task-group task-group-${group}`} key={group} aria-labelledby={`task-group-${group}`}><header className="task-group-heading"><h3 id={`task-group-${group}`}>{activeDate && group === "upcoming" ? (english ? "Due this day" : "当天到期") : groupLabels[group]}<span>{groups[group].length}</span></h3></header><div className="task-list">{groups[group].map(renderTask)}{group !== "overdue" && <button type="button" className="task-inline-add" onClick={() => startNew(group === "today" ? today : group === "upcoming" ? selectedDueDate : "")}><Icon name="plus" />{english ? "Add a task" : "添加任务"}</button>}</div></section>)}
          {groups.completed.length > 0 && (status === "done" ? <section className="task-group"><div className="task-list">{groups.completed.map(renderTask)}</div></section> : <Disclosure className="task-completed" title={groupLabels.completed} trailing={groups.completed.length}><div className="task-list">{groups.completed.map(renderTask)}</div></Disclosure>)}
        </> : <div className="task-empty"><Icon name="check" /><h3>{activeTag ? (english ? "No tasks match this filter" : "这个筛选下还没有任务") : status === "done" ? (english ? "No completed tasks" : "还没有完成项") : (english ? "A little breathing room" : "留一点空白，也很好")}</h3><p>{activeDate ? (english ? "No tasks due here. Add one when you need it." : "这一天暂时没有任务到期，有想做的事就记下来。") : (english ? "Add your next task here." : "把接下来想做的事，记在这里。")}</p>{activeTag && <button type="button" className="task-inline-add" onClick={() => setSelectedTag(null)}>{english ? "Show all tags" : "查看全部标签"}</button>}{status !== "done" && <button type="button" className="task-inline-add" onClick={() => startNew(selectedDueDate)}><Icon name="plus" />{english ? "Add a task" : "添加任务"}</button>}</div>}
      </div>
      </div>
    </div>
  </div>;
}
