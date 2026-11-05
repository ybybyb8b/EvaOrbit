"use client";
import {useFormPreview} from "@/components/form-preview";
import {useHealthData} from "@/components/health-data-context";
import { ErrorNotice } from "@/components/error-notice";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";

import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { compactDateTimeValue } from "@/components/date-time-field";
import { type TrainingBodyPart, type TrainingInputSuggestions, type TrainingLog, type TrainingType } from "@/lib/types";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import { TrainingLogEditor, trainingBodyPartLabels, trainingTypeLabels, type TrainingLogDraft } from "./training-log-editor";
import type { TrainingPlan } from "@/lib/types";
import { workoutActivityLabel, workoutStatus } from "@/lib/training-workout";
import { trainingSessionTitle } from "@/lib/training-session";
import { TrainingPlanEditor } from "./training-plan-editor";
import { FormSheet } from "@/components/form-sheet";

function trainingMeta(log: TrainingLog, english: boolean) { return [log.occurredHasExplicitTime ? compactDateTimeValue(log.occurredAt, true).slice(11) : "", log.course || trainingSessionTitle(log.sessionDetails) || log.trainingContent, log.teacher, log.durationMinutes ? english ? `${log.durationMinutes} min` : `${log.durationMinutes} 分钟` : ""].filter(Boolean).join(" · "); }

export function TrainingSection({ initial, initialRecent, initialSuggestions, initialFocused, initialPlan, today }: { initial: TrainingLog[]; initialRecent: TrainingLog[]; initialSuggestions: TrainingInputSuggestions; initialFocused?: TrainingLog; initialPlan: TrainingPlan | null; today: string }) {
  const preview=useFormPreview();

  const {read}=useHealthData();

  useDataRefresh("/health", () => reload());
  const { english } = useLocale();
  const [logs, setLogs] = useServerDataState(initial);
  const [recent, setRecent] = useServerDataState(initialRecent);
  const [suggestions, setSuggestions] = useServerDataState(initialSuggestions);
  const [editing, setEditing] = useState<TrainingLog | undefined>(initialFocused);
  const [open, setOpen] = useState(Boolean(initialFocused));
  const [plan, setPlan] = useServerDataState(initialPlan);
  const [planEditing, setPlanEditing] = useState(false);
  const [planCompletion, setPlanCompletion] = useState<{ plan: TrainingPlan; requestKey: string }>();
  const [workoutChoices, setWorkoutChoices] = useState<TrainingLog[] | null>(null);
  const [workoutDate, setWorkoutDate] = useState(today);
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [sessionDraft, setSessionDraft] = useState<TrainingLogDraft>();
  const [sessionDirty, setSessionDirty] = useState(false);
  const workoutRequest = useRef(0);
  const [planError, setPlanError] = useState("");
  const [switching, setSwitching] = useState(false);
  const switchLock = useRef(false);
  const [previewDayId, setPreviewDayId] = useState<string | null>(null);
  const currentDay = plan?.days.find(day => day.id === plan.currentDayId);
  const displayedDay = plan?.days.find(day => day.id === previewDayId) ?? currentDay;
  const previewing = Boolean(displayedDay && displayedDay.id !== plan?.currentDayId);
  function acceptPlan(next: TrainingPlan) { setPlan(current => !current || next.version >= current.version ? next : current); setPreviewDayId(null); }
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await read("/api/health/training/plan");
        if (!response.ok) return;
        const next: TrainingPlan | null = await response.json();
        if (active && next) setPlan(current => !current || next.version >= current.version ? next : current);
      } catch { /* The current plan remains usable; completion checks its server version. */ }
    }
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { active = false; window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [setPlan,read]);
  async function switchDay(dayId: string) {
    if(preview)return;
    if (!plan || plan.currentDayId === dayId || switchLock.current) return;
    const dayIndex = plan.days.findIndex(day => day.id === dayId);
    if (dayIndex < 0 || !window.confirm(english ? `Set Day ${dayIndex + 1} as up next? This changes your plan progress without logging a workout.` : `将 Day ${dayIndex + 1} 设为待练？这会更改计划进度，不会新增训练记录。`)) return;
    switchLock.current = true; setSwitching(true); setPlanError("");
    try {
      const response = await read("/api/health/training/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...plan, currentDayId: dayId, expectedVersion: plan.version }) });
      const result = await response.json();
      if (!response.ok) { setPlanError(result.error); return; }
      acceptPlan(result);
    } catch { setPlanError(english ? "Could not switch day. Try again." : "未能切换训练日，请重试。"); }
    finally { switchLock.current = false; setSwitching(false); }
  }
  const pastLogs = recent.filter((log) => dateInEvaOrbit(new Date(log.occurredAt)) !== today);
  const typeLabel = (type: TrainingType) => trainingTypeLabels[type][english ? "en" : "zh"];
  const bodyPartLabel = (part: TrainingBodyPart) => trainingBodyPartLabels[part][english ? "en" : "zh"];

  function openCreate() { setPlanCompletion(undefined); setWorkoutChoices(null); setEditing(undefined); setOpen(true); }
  function openEdit(log: TrainingLog) { setPlanCompletion(undefined); setWorkoutChoices(null); setEditing(log); setOpen(true); }
  function completeAndLog() {
    if (!plan) return;
    setSessionDraft(undefined); setSessionDirty(false);
    const workouts = logs.filter(log => log.workout && !log.workoutDeleted && !log.planCompleted && dateInEvaOrbit(new Date(log.occurredAt)) === today);
    workoutRequest.current++; setWorkoutDate(today); setWorkoutLoading(false); setPlanError("");
    setPlanCompletion({ plan, requestKey: crypto.randomUUID() });
    setEditing(workouts.length === 1 ? workouts[0] : undefined);
    setWorkoutChoices(workouts.length > 1 ? workouts : null);
    setOpen(true);
  }
  async function chooseWorkoutDate(date: string) {
    const request = ++workoutRequest.current;
    setWorkoutDate(date); setWorkoutChoices([]); setPlanError(""); setWorkoutLoading(Boolean(date));
    if (!date) return;
    try {
      const response = await read(`/api/health/training?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error();
      const rows: TrainingLog[] = await response.json();
      if (request === workoutRequest.current) setWorkoutChoices(rows.filter(log => log.workout && !log.workoutDeleted && !log.planCompleted));
    } catch { if (request === workoutRequest.current) setPlanError(english ? "Could not load workouts. Choose the date to retry." : "未能加载训练，请重新选择日期重试。"); }
    finally { if (request === workoutRequest.current) setWorkoutLoading(false); }
  }
  function chooseOtherWorkout(draft?: TrainingLogDraft, dirty = false) {
    setSessionDirty(dirty);
    if (draft) setSessionDraft(draft);
    workoutRequest.current++; setWorkoutDate(today); setWorkoutLoading(false); setPlanError("");
    setWorkoutChoices(logs.filter(log => log.workout && !log.workoutDeleted && !log.planCompleted));
    if (draft && draft.occurredAt.slice(0, 10) !== today) void chooseWorkoutDate(draft.occurredAt.slice(0, 10));
  }
  function selectWorkout(log?: TrainingLog) { workoutRequest.current++; setWorkoutLoading(false); setEditing(log); setWorkoutChoices(null); }
  function close() {
    workoutRequest.current++;
    setSessionDraft(undefined); setSessionDirty(false);
    setOpen(false); setEditing(undefined); setPlanCompletion(undefined); setWorkoutChoices(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("training")) {
      url.searchParams.delete("training");
      url.searchParams.set("view", "training");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  async function reload(completedPlan?: TrainingPlan) {
    if (completedPlan) acceptPlan(completedPlan);
    try {
    const [logsResponse, recentResponse, suggestionsResponse] = await Promise.all([read(`/api/health/training?date=${encodeURIComponent(today)}`), read(`/api/health/training?from=${shiftDate(today,-6)}&to=${shiftDate(today,1)}`), read("/api/health/training/suggestions")]);
    if (logsResponse.ok) setLogs(await logsResponse.json());
    if (recentResponse.ok) setRecent(await recentResponse.json());
    if (suggestionsResponse.ok) setSuggestions(await suggestionsResponse.json());
    } catch { setPlanError(english ? "Saved. Refresh to reload training history." : "已保存，训练历史刷新失败，请刷新页面查看。"); }
  }

  return <section className="health-section training-section">
    {open && (workoutChoices ? <FormSheet title={english ? "Link a workout" : "关联运动"} onClose={() => selectWorkout(editing)}>
      <div className="training-workout-picker training-plan-workout-picker">
      <p className="training-plan-hint">{english ? "Choose an Apple Health workout to complete this training day. Earlier dates are available." : "选择用于完成当前训练日的 Apple Health 记录，也可选择之前的日期。"}</p>
      <label className="field"><span>{english ? "Workout date" : "训练日期"}</span><input type="date" value={workoutDate} onChange={event => void chooseWorkoutDate(event.target.value)} /></label>
      {workoutLoading && <p role="status">{english ? "Loading workouts…" : "正在加载训练…"}</p>}
      {planError && <ErrorNotice inline>{planError}</ErrorNotice>}
      {!workoutLoading && !planError && !workoutChoices.length && <p className="training-plan-hint">{english ? "No available Apple Health workouts on this date." : "该日期暂无可关联的 Apple Health 训练。"}</p>}
      {!workoutLoading && workoutChoices.length > 0 && <div className="training-workout-options">{workoutChoices.map(log => <button type="button" className="training-log-main" key={log.id} onClick={() => selectWorkout(log)}><span><strong>{workoutActivityLabel(log, english)}</strong><small>{workoutDate} · {trainingMeta(log, english)}</small></span><Icon name={editing?.id === log.id ? "check" : "arrow"} /></button>)}</div>}
      <button type="button" className="text-button" onClick={() => selectWorkout()}>{english ? "Log a separate session" : "手动记录独立训练"}</button>
      </div>
    </FormSheet> : <TrainingLogEditor record={editing} resumeDraft={sessionDraft} resumeDirty={sessionDirty} initialDate={planCompletion ? workoutDate || today : today} planCompletion={planCompletion} suggestions={suggestions} onSuggestionsChanged={setSuggestions} onChooseWorkout={chooseOtherWorkout} onClose={close} onSaved={reload} onDeleted={reload} />)}
    {planEditing && <TrainingPlanEditor plan={plan} exerciseSuggestions={suggestions.exercises ?? []} suggestions={suggestions} onSuggestionsChanged={setSuggestions} onSaved={acceptPlan} onClose={() => setPlanEditing(false)} />}
    <article className="training-plan-card" aria-label={english ? "Current training plan" : "当前训练计划"}>
      <div className="training-plan-heading"><h2>{plan?.name ?? (english ? "Current training plan" : "当前训练计划")}</h2><button type="button" className="text-button" disabled={switching} onClick={() => setPlanEditing(true)}>{plan ? english ? "Edit plan" : "编辑计划" : english ? "Set up plan" : "创建计划"}</button></div>
      {plan && plan.days.length > 0 && <div className="training-plan-progress" aria-label={english ? "Preview training days" : "预览训练日"}>{plan.days.map((day, index) => <button type="button" key={day.id} aria-pressed={day.id === displayedDay?.id} aria-current={day.id === plan.currentDayId ? "step" : undefined} disabled={switching} title={day.name} onClick={() => { setPreviewDayId(day.id); setPlanError(""); }}>Day {index + 1}</button>)}</div>}
      {displayedDay ? <>
        <div className="training-plan-overview">
          <h3><span className="training-plan-day-kicker">Day {plan!.days.indexOf(displayedDay) + 1}</span><span>{displayedDay.name}</span></h3>
          {displayedDay.durationMinutes && <span className="training-plan-duration">{english ? `About ${displayedDay.durationMinutes} min` : `预计 ${displayedDay.durationMinutes} 分钟`}</span>}
          <p className="training-plan-meta"><span>{typeLabel(displayedDay.trainingType)}</span>{displayedDay.bodyParts.length > 0 && <span>{displayedDay.bodyParts.map(bodyPartLabel).join(english ? " · " : "、")}</span>}</p>
        </div>
        <div className="training-plan-day-content">
          {displayedDay.content && <p className="training-plan-content">{displayedDay.content}</p>}
          {(["warmup", "training"] as const).map(phase => <Fragment key={phase}>{phase === "training" && (displayedDay.videoUrls.length > 0 && <section className="training-plan-content-group" aria-label={english ? "Video practice" : "视频跟练"}><h4>{english ? "Video practice" : "视频跟练"}</h4><ul className="training-plan-videos">{displayedDay.videoUrls.map((url, index) => <li key={`${index}:${url}`}><a href={url} target="_blank" rel="noopener noreferrer">{displayedDay.videoTitles?.[url] || (english ? `Video ${index + 1}` : `视频 ${index + 1}`)}</a></li>)}</ul></section>)}{(displayedDay.exercises ?? []).some(exercise => (exercise.phase ?? "training") === phase) && <section className="training-plan-content-group" aria-label={phase === "warmup" ? english ? "Warm-up" : "热身" : english ? "Main training" : "正式训练"}><h4>{phase === "warmup" ? english ? "Warm-up" : "热身" : english ? "Main training" : "正式训练"}</h4><ul className="training-plan-exercise-summary">{displayedDay.exercises!.filter(exercise => (exercise.phase ?? "training") === phase).map(exercise => <li key={exercise.id}><strong>{exercise.name}</strong><span>{[exercise.sets ? `${exercise.sets} ${english ? "sets" : "组"}` : "", exercise.target].filter(Boolean).join(" × ")}</span></li>)}</ul></section>}</Fragment>)}
        </div>
        <div className="training-plan-footer"><p>{previewing ? english ? `Preview · Up next: Day ${plan!.days.indexOf(currentDay!) + 1}` : `预览中 · 待练仍为 Day ${plan!.days.indexOf(currentDay!) + 1}` : english ? "Up next · Rest days keep your place" : "Up next · 休息日不影响进度"}</p>{previewing ? <button type="button" className="button secondary" disabled={switching||preview} onClick={() => void switchDay(displayedDay.id)}>{english ? "Set as up next" : "设为待练"}</button> : <button type="button" className="button primary" disabled={switching} onClick={completeAndLog}>{displayedDay.exercises?.length ? english ? "Train & log" : "训练并记录" : english ? "Complete & log" : "完成并记录"}</button>}</div>
      </> : <p className="training-plan-hint">{plan ? english ? "No training days. Edit your plan to add one." : "暂无训练日，编辑计划即可添加。" : english ? "Start with the four-day template and make it yours." : "从四日模板开始，可自由修改训练日和顺序。"}</p>}
      {planError && <ErrorNotice role="alert">{planError}</ErrorNotice>}
    </article>
    <div className="section-heading"><div><h2>{english ? "Today's training" : "今日训练"}</h2></div><div className="training-heading-actions"><PageLogAction label={english ? "Log training" : "记录训练"} className="text-button training-add" onClick={openCreate}><Icon name="plus" />{english ? "Log training" : "记录训练"}</PageLogAction></div></div>
    {logs.length ? <div className="training-log-list">{logs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{workoutActivityLabel(log, english) || typeLabel(log.trainingType)}</strong><small>{[log.bodyParts.map(bodyPartLabel).join(" · "),workoutStatus(log, english)].filter(Boolean).join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log, english)}</span></button><button className="icon-button subtle" aria-label={`${english ? "Edit" : "编辑"} ${typeLabel(log.trainingType)}`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">{english ? "No training logged today." : "今日还没有训练记录。"}</p>}
    <details className="training-history"><summary><span><small>{english ? "LAST 7 DAYS" : "最近 7 天"}</small><strong>{english ? "Training history" : "训练记录"}</strong></span><span>{pastLogs.length}</span></summary>
      {pastLogs.length ? <div className="training-log-list training-recent-list">{pastLogs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{workoutActivityLabel(log, english) || typeLabel(log.trainingType)}</strong><small>{new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateInEvaOrbit(new Date(log.occurredAt))}T12:00:00Z`))} · {[log.bodyParts.map(bodyPartLabel).join(" · "),workoutStatus(log, english)].filter(Boolean).join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log, english)}</span></button><button className="icon-button subtle" aria-label={`${english ? "Edit" : "编辑"} ${typeLabel(log.trainingType)}`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">{english ? "No earlier training in the last 7 days." : "最近 7 天没有更早的训练记录。"}</p>}
      <p className="training-history-note">{english ? "Earlier training stays available in Home Calendar + Timeline." : "更早训练请通过首页 Calendar + Timeline 查看。"}</p>
    </details>
  </section>;
}
