"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown5, ArrowLeft2, ArrowRight2 } from "reicon-react";
import type { HomeDayOverview } from "@/lib/home-day";
import type { UiLanguage } from "@/lib/locale";
import { playNativeHaptic } from "@/lib/native-haptics";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { periodDayForDate } from "@/lib/timeline";
import type { DailyJournalMood, TimelineEvent, TimelineMonthSummary } from "@/lib/types";
import { HomeQuickLog } from "./home-quick-log";

const sourceMeta: Record<TimelineEvent["sourceType"], { en: string; zh: string }> = {
  food: { en: "Food", zh: "吃吃" }, drink: { en: "Drinks", zh: "喝喝" }, tracker: { en: "Trackers", zh: "观测" }, cat: { en: "Cats", zh: "咪子" }, health: { en: "Health", zh: "体征" }, training: { en: "Training", zh: "训练" }, person: { en: "Relations", zh: "她们" }, subscription: { en: "Subscription", zh: "订阅" }, media: { en: "Media", zh: "展架" }, chronicle: { en: "Chronicle", zh: "纪事" },
};
const mealLabels: Record<string, { en: string; zh: string }> = { breakfast: { en: "Breakfast", zh: "早餐" }, lunch: { en: "Lunch", zh: "午餐" }, dinner: { en: "Dinner", zh: "晚餐" }, snack: { en: "Snack", zh: "加餐" }, late_night: { en: "Late night", zh: "夜宵" } };
const trainingLabels: Record<string, { en: string; zh: string }> = { cardio: { en: "Cardio", zh: "有氧训练" }, strength: { en: "Strength", zh: "无氧训练" }, mixed: { en: "Mixed training", zh: "混合训练" } };
const flowLabels: Record<string, { en: string; zh: string }> = { none: { en: "No flow", zh: "无经量" }, unspecified: { en: "Flow not specified", zh: "经量未指定" }, light: { en: "Light", zh: "少量" }, medium: { en: "Medium", zh: "中等" }, heavy: { en: "Heavy", zh: "大量" } };
const moodOptions: Array<{ value: DailyJournalMood; emoji: string; en: string; zh: string }> = [
  { value: -2, emoji: "😞", en: "Very low", zh: "很低落" }, { value: -1, emoji: "🙁", en: "Low", zh: "低落" }, { value: 0, emoji: "😐", en: "Neutral", zh: "平静" }, { value: 1, emoji: "🙂", en: "Good", zh: "不错" }, { value: 2, emoji: "😊", en: "Great", zh: "很好" },
];
const activityLabels = { phone: { emoji: "🍠", en: "Phone", zh: "玩手机" }, screen: { emoji: "📺", en: "TV & movies", zh: "电视电影" }, gaming: { emoji: "🎮", en: "Gaming", zh: "玩游戏" } } as const;

function shiftMonth(month: string, offset: number) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value - 1 + offset, 1, 12)).toISOString().slice(0, 7); }
function shiftDate(date: string, offset: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); }
function startOfWeek(date: string) { const value = new Date(`${date}T12:00:00Z`); return shiftDate(date, -((value.getUTCDay() + 6) % 7)); }
function dateFor(month: string, day: number) { return `${month}-${String(day).padStart(2, "0")}`; }
function timeLabel(value: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(value)); }
function durationLabel(minutes: number, english: boolean) { const hours = Math.floor(minutes / 60), rest = minutes % 60; if (!hours) return english ? `${rest}m` : `${rest} 分钟`; return rest ? english ? `${hours}h ${rest}m` : `${hours} 小时 ${rest} 分` : english ? `${hours}h` : `${hours} 小时`; }
function titleFor(item: TimelineEvent, english: boolean) {
  if (item.eventType === "health.weight") return english ? "Weight" : "体重";
  if (item.eventType === "health.menstrual_flow") return item.metadata.isCycleStart ? (english ? "Period started" : "经期开始") : (english ? "Menstrual flow" : "经量记录");
  if (item.eventType === "health.medication_dose") return item.title;
  if (item.sourceType === "food" && typeof item.metadata.mealType === "string") { const meal = mealLabels[item.metadata.mealType]; if (meal) return english ? meal.en : meal.zh; }
  if (item.sourceType === "training") { const course = typeof item.metadata.course === "string" ? item.metadata.course.trim() : ""; const training = typeof item.metadata.trainingType === "string" ? trainingLabels[item.metadata.trainingType] : null; return course || (training ? english ? training.en : training.zh : english ? "Training" : "训练"); }
  return item.title;
}
function detailFor(item: TimelineEvent, english: boolean) {
  if (item.sourceType !== "person") return item.detail;
  const names = Array.isArray(item.metadata.personNames) ? item.metadata.personNames.filter((name): name is string => typeof name === "string" && Boolean(name.trim())) : [];
  const selfShare = typeof item.metadata.selfShareAmountMinor === "number" ? item.metadata.selfShareAmountMinor : null, total = typeof item.metadata.totalAmountMinor === "number" ? item.metadata.totalAmountMinor : null, amount = selfShare ?? total;
  const amountLabel = amount === null ? null : selfShare === null ? `¥${(amount / 100).toFixed(2)}` : `${english ? "Your share" : "你的份额"} ¥${(amount / 100).toFixed(2)}`;
  const peopleLabel = names.length ? `${english ? "With" : "和"} ${names.join(english ? ", " : "、")}` : null, note = typeof item.metadata.note === "string" ? item.metadata.note : null;
  return [peopleLabel, amountLabel, note].filter(Boolean).join(" · ") || item.detail;
}

export function HomeCalendarTimeline({ initialDay, initialSummary, language }: { initialDay: HomeDayOverview; initialSummary: TimelineMonthSummary; language: UiLanguage }) {
  const english = language === "en", today = initialDay.date;
  const [month, setMonth] = useState(initialSummary.month), [summaries, setSummaries] = useState<Record<string, TimelineMonthSummary>>({ [initialSummary.month]: initialSummary });
  const [selected, setSelected] = useState(today), [calendarExpanded, setCalendarExpanded] = useState(false), [timelineExpanded, setTimelineExpanded] = useState(false);
  const [days, setDays] = useState<Record<string, HomeDayOverview>>({ [today]: initialDay });
  const [loadingDate, setLoadingDate] = useState<string | null>(null), [loadingMonth, setLoadingMonth] = useState(false), [error, setError] = useState("");
  const [journalContent, setJournalContent] = useState(""), [journalMood, setJournalMood] = useState<DailyJournalMood | null>(null), [editingJournalId, setEditingJournalId] = useState<number | null>(null), [savingJournal, setSavingJournal] = useState(false);
  const dayRequest = useRef<AbortController | null>(null), monthRequest = useRef<AbortController | null>(null), day = days[selected], events = day?.events ?? [];
  const [year, monthNumber] = month.split("-").map(Number), leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7, dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), selectedWeekStart = startOfWeek(selected);
  const visibleWeek = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedWeekStart, index)), [selectedWeekStart]);
  const weekdays = english ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const selectedLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${selected}T12:00:00Z`));
  const periods = useMemo(() => [...new Map(Object.values(summaries).flatMap((summary) => summary.periods ?? []).map((period) => [period.id, period])).values()], [summaries]);
  const periodContext = periodDayForDate(periods, selected, today), periodFlow = events.find((item) => item.eventType === "health.menstrual_flow" && item.metadata.periodId === periodContext?.period.id), periodDose = events.find((item) => item.eventType === "health.medication_dose" && item.metadata.periodId === periodContext?.period.id);

  useEffect(() => {
    const requiredMonths = calendarExpanded ? [month] : [...new Set(visibleWeek.map((date) => date.slice(0, 7)))], missingMonths = requiredMonths.filter((value) => !summaries[value]);
    if (!missingMonths.length) return;
    const controller = new AbortController();
    void Promise.all(missingMonths.map(async (value) => { const response = await fetch(`/api/timeline?month=${encodeURIComponent(value)}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(); return response.json() as Promise<TimelineMonthSummary>; })).then((results) => setSummaries((current) => Object.fromEntries([...Object.entries(current), ...results.map((result) => [result.month, result])]))).catch(() => undefined);
    return () => controller.abort();
  }, [calendarExpanded, month, summaries, visibleWeek]);

  async function loadDay(date: string, force = false) {
    setSelected(date); setTimelineExpanded(false); setError(""); setEditingJournalId(null); setJournalContent(""); setJournalMood(null);
    if (days[date] && !force) return;
    dayRequest.current?.abort(); const controller = new AbortController(); dayRequest.current = controller; setLoadingDate(date);
    try { const response = await fetch(`/api/home-day?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(); const result = await response.json() as HomeDayOverview; setDays((current) => ({ ...current, [date]: result })); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this day" : "无法读取这一天"); }
    finally { if (dayRequest.current === controller) setLoadingDate(null); }
  }
  async function refreshSelectedDate() {
    const date = selected;
    try { const [dayResponse, summaryResponse] = await Promise.all([fetch(`/api/home-day?date=${encodeURIComponent(date)}`, { cache: "no-store" }), fetch(`/api/timeline?month=${encodeURIComponent(date.slice(0, 7))}`, { cache: "no-store" })]); if (!dayResponse.ok || !summaryResponse.ok) throw new Error(); const [nextDay, summary] = await Promise.all([dayResponse.json() as Promise<HomeDayOverview>, summaryResponse.json() as Promise<TimelineMonthSummary>]); setDays((current) => ({ ...current, [date]: nextDay })); setSummaries((current) => ({ ...current, [summary.month]: summary })); }
    catch { setError(english ? "Saved, but this day could not refresh" : "已保存，但这一天刷新失败"); }
  }
  async function changeMonth(nextMonth: string) {
    monthRequest.current?.abort(); const controller = new AbortController(); monthRequest.current = controller; setLoadingMonth(true); setError("");
    try { const response = await fetch(`/api/timeline?month=${encodeURIComponent(nextMonth)}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(); const result = await response.json() as TimelineMonthSummary, nextDate = today.startsWith(nextMonth) ? today : `${nextMonth}-01`; setMonth(nextMonth); setSummaries((current) => ({ ...current, [nextMonth]: result })); playNativeHaptic("selection"); await loadDay(nextDate); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this month" : "无法读取这个月份"); }
    finally { if (monthRequest.current === controller) setLoadingMonth(false); }
  }
  async function saveJournal(event: FormEvent) {
    event.preventDefault(); if (!journalContent.trim()) return; setSavingJournal(true); setError("");
    try { const response = await fetch(editingJournalId ? `/api/daily-journal/${editingJournalId}` : "/api/daily-journal", { method: editingJournalId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(!editingJournalId && { date: selected }), content: journalContent, moodScore: journalMood }) }); if (!response.ok) throw new Error(); setJournalContent(""); setJournalMood(null); setEditingJournalId(null); await refreshSelectedDate(); }
    catch { setError(english ? "Could not save this journal entry" : "无法保存这条日记"); } finally { setSavingJournal(false); }
  }
  async function removeJournal(id: number) {
    setError(""); try { const response = await fetch(`/api/daily-journal/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error(); if (editingJournalId === id) { setEditingJournalId(null); setJournalContent(""); setJournalMood(null); } await refreshSelectedDate(); } catch { setError(english ? "Could not delete this journal entry" : "无法删除这条日记"); }
  }
  function editJournal(entry: HomeDayOverview["journal"][number]) { const cancel = editingJournalId === entry.id; setEditingJournalId(cancel ? null : entry.id); setJournalContent(cancel ? "" : entry.content); setJournalMood(cancel ? null : entry.moodScore); }
  function selectCalendarDate(date: string) { setMonth(date.slice(0, 7)); playNativeHaptic("selection"); void loadDay(date); }
  function returnToToday() { const todayMonth = today.slice(0, 7); if (month !== todayMonth) void changeMonth(todayMonth); else { playNativeHaptic("selection"); void loadDay(today); } }
  function moveCalendar(offset: number) { if (calendarExpanded) void changeMonth(shiftMonth(month, offset)); else selectCalendarDate(shiftDate(selected, offset * 7)); }
  function calendarDay(date: string, index: number) {
    const daySummary = summaries[date.slice(0, 7)]?.days[date], context = periodDayForDate(summaries[date.slice(0, 7)]?.periods ?? [], date, today), count = daySummary?.count ?? 0, gridIndex = calendarExpanded ? leading + Number(date.slice(-2)) - 1 : index, periodEnd = context?.period.endedOn ?? today, periodStart = Boolean(context && (date === context.period.startedOn || gridIndex % 7 === 0 || calendarExpanded && index === 0)), periodFinish = Boolean(context && (date === periodEnd || gridIndex % 7 === 6 || calendarExpanded && index === dayCount - 1)), periodLabel = context ? english ? `, period day ${context.day}` : `，经期第 ${context.day} 天` : "";
    return <button type="button" key={date} className={selected === date ? "selected" : ""} data-today={date === today} data-has-record={count > 0} data-highlighted={daySummary?.highlighted === true} data-outside-month={date.slice(0, 7) !== month} data-period={Boolean(context)} data-period-start={periodStart} data-period-end={periodFinish} data-period-day-one={context?.day === 1} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} aria-label={`${date}${periodLabel}${count ? english ? `, ${count} entries` : `，${count} 条记录` : english ? ", no entries" : "，没有记录"}`} onClick={() => selectCalendarDate(date)}><strong>{Number(date.slice(-2))}</strong><span className="home-calendar-indicator" aria-hidden="true">{count > 0 && <i />}</span></button>;
  }

  return <section className="today-focus home-calendar-card" aria-label={english ? "Calendar and daily overview" : "日历与每日概览"}>
    <section className="home-calendar" aria-label={english ? "Calendar" : "日历"}>
      <header className="home-calendar-header"><h2>{monthLabel}</h2><div className="home-calendar-actions">{selected !== today && <button type="button" className="home-calendar-today" onClick={returnToToday} disabled={loadingMonth}>{english ? "Today" : "今天"}</button>}<button type="button" className="home-calendar-previous" aria-label={calendarExpanded ? english ? "Previous month" : "上个月" : english ? "Previous week" : "上一周"} disabled={loadingMonth} onClick={() => moveCalendar(-1)}><ArrowLeft2 className="home-calendar-action-icon" size={15} weight="Outline" aria-hidden="true" /></button><button type="button" className="home-calendar-next" aria-label={calendarExpanded ? english ? "Next month" : "下个月" : english ? "Next week" : "下一周"} disabled={loadingMonth} onClick={() => moveCalendar(1)}><ArrowRight2 className="home-calendar-action-icon" size={15} weight="Outline" aria-hidden="true" /></button><button type="button" className="home-calendar-toggle" aria-label={calendarExpanded ? english ? "Show week" : "收起为周" : english ? "Show month" : "展开月份"} aria-expanded={calendarExpanded} onClick={() => { playNativeHaptic("selection"); setCalendarExpanded((current) => !current); }}><ArrowDown5 className="home-calendar-action-icon" size={14} weight="Outline" aria-hidden="true" /></button></div></header>
      <div className="home-calendar-grid" data-expanded={calendarExpanded} key={calendarExpanded ? month : selectedWeekStart}>{weekdays.map((value) => <span className="home-calendar-weekday" key={value}>{value}</span>)}{calendarExpanded && Array.from({ length: leading }, (_, index) => <span className="home-calendar-blank" key={`leading-${index}`} aria-hidden="true" />)}{(calendarExpanded ? Array.from({ length: dayCount }, (_, index) => dateFor(month, index + 1)) : visibleWeek).map(calendarDay)}</div>
    </section>
    <header className="home-selected-date-heading"><div><span className="eyebrow">{selected === today ? english ? "Today" : "今天" : english ? "Selected day" : "所选日期"}</span><h2>{selectedLabel}</h2></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loadingDate === selected || !day ? <div className="home-timeline-loading" aria-label={english ? "Loading day" : "正在读取这一天"}><span /><span /><span /></div> : <>
      <div className="home-day-grid">
        <article className="home-day-pane home-sleep-pane"><header><span aria-hidden="true">😴</span><h3>{english ? "Sleep" : "睡眠"}</h3></header>{day.sleep ? <><strong className="home-day-primary">{durationLabel(day.sleep.durationMinutes, english)}</strong><p>{timeLabel(day.sleep.startAt)} – {timeLabel(day.sleep.endAt)}</p>{day.sleep.napCount > 0 && <small>{english ? `${day.sleep.napCount} nap(s), ${durationLabel(day.sleep.napMinutes, true)}` : `另有 ${day.sleep.napCount} 次小睡，共 ${durationLabel(day.sleep.napMinutes, false)}`}</small>}</> : <p className="home-pane-empty">{english ? "No 😴 calendar event ending this day" : "没有在这一天结束的 😴 日历记录"}</p>}</article>
        <article className="home-day-pane"><header><span aria-hidden="true">✓</span><h3>{english ? "Tasks" : "任务"}</h3><small>{day.tasks.filter((task) => task.completed).length}/{day.tasks.length}</small></header>{day.tasks.length ? <ul className="home-pane-list">{day.tasks.slice(0, 4).map((task) => <li key={task.id} data-completed={task.completed}><Link href="/tasks"><span>{task.completed ? "✓" : "○"}</span><strong>{task.title}</strong>{task.dueTime && <time>{task.dueTime}</time>}</Link></li>)}</ul> : <p className="home-pane-empty">{english ? "No tasks due" : "这一天没有到期任务"}</p>}</article>
        <article className="home-day-pane"><header><span aria-hidden="true">🍚</span><h3>{english ? "Meals" : "一日三餐"}</h3></header>{day.meals.length ? <ul className="home-pane-list home-meal-list">{day.meals.map((meal, index) => <li key={`${meal.mealType}-${index}`}><span>{english ? mealLabels[meal.mealType]?.en ?? "Meal" : mealLabels[meal.mealType]?.zh ?? "饮食"}</span><strong>{meal.detail || meal.title}</strong></li>)}</ul> : <p className="home-pane-empty">{english ? "No meals recorded" : "还没有饮食记录"}</p>}</article>
        <article className="home-day-pane home-journal-pane"><header><span aria-hidden="true">✎</span><h3>{english ? "Day notes" : "今日一记"}</h3><small>{day.journal.length || ""}</small></header>{day.journal.length > 0 && <div className="home-journal-entries">{day.journal.map((entry) => <div key={entry.id} className="home-journal-entry">{entry.moodScore !== null && <span aria-label={english ? moodOptions.find((option) => option.value === entry.moodScore)?.en : moodOptions.find((option) => option.value === entry.moodScore)?.zh}>{moodOptions.find((option) => option.value === entry.moodScore)?.emoji}</span>}<p>{entry.content}</p><div><button type="button" onClick={() => editJournal(entry)}>{editingJournalId === entry.id ? english ? "Cancel" : "取消" : english ? "Edit" : "编辑"}</button><button type="button" onClick={() => void removeJournal(entry.id)}>{english ? "Delete" : "删除"}</button></div></div>)}</div>}
          <form className="home-journal-form" onSubmit={saveJournal}><textarea rows={2} value={journalContent} onChange={(event) => setJournalContent(event.target.value)} placeholder={english ? "Write whenever something comes to mind…" : "想到什么，就记一点……"} maxLength={10_000} /><div className="home-journal-controls"><div className="home-mood-picker" aria-label={english ? "Optional mood" : "可选心情"}>{moodOptions.map((option) => <button type="button" key={option.value} className={journalMood === option.value ? "selected" : ""} aria-pressed={journalMood === option.value} aria-label={english ? option.en : option.zh} onClick={() => setJournalMood((current) => current === option.value ? null : option.value)}>{option.emoji}</button>)}</div><button type="submit" className="button primary" disabled={savingJournal || !journalContent.trim()}>{editingJournalId ? english ? "Update" : "更新" : english ? "Add" : "记下"}</button></div></form>
        </article>
      </div>
      <div className="home-activity-summary" aria-label={english ? "Calendar activity totals" : "日历活动汇总"}>{day.activities.map((activity) => { const label = activityLabels[activity.category]; return <div key={activity.category}><span aria-hidden="true">{label.emoji}</span><small>{english ? label.en : label.zh}</small><strong>{durationLabel(activity.durationMinutes, english)}</strong></div>; })}</div>
      <section className="home-day-timeline" aria-busy={loadingDate === selected}><header className="home-day-heading"><h2>Timeline</h2>{events.length > 4 && <button type="button" className="section-link" onClick={() => setTimelineExpanded((current) => !current)}>{timelineExpanded ? english ? "Show less" : "收起" : english ? `Show all ${events.length}` : `查看全部 ${events.length} 条`}</button>}</header>{periodContext && <div className="home-period-context"><strong>{english ? "Period" : "经期"}</strong><span>{english ? `Day ${periodContext.day}` : `第 ${periodContext.day} 天`}</span>{periodFlow && typeof periodFlow.metadata.flow === "string" && flowLabels[periodFlow.metadata.flow] && <span>{english ? flowLabels[periodFlow.metadata.flow].en : flowLabels[periodFlow.metadata.flow].zh}</span>}{periodDose && <span>{english ? `${periodDose.title} recorded` : `已记录 ${periodDose.title}`}</span>}</div>}{events.length ? <div className="home-activity-list home-selected-day-events" key={selected}>{events.slice(0, timelineExpanded ? undefined : 4).map((item) => { const source = sourceMeta[item.sourceType], detail = detailFor(item, english); return <Link href={item.href} key={item.id} className="home-activity-item" data-source={item.sourceType}><time>{item.hasExplicitTime ? timeLabel(item.occurredAt) : english ? "All day" : "全天"}</time><span className="home-activity-marker" aria-hidden="true" /><span className="home-activity-copy"><span className="home-activity-source">{english ? source.en : source.zh}</span><strong className="user-content">{titleFor(item, english)}</strong>{detail && <small className="user-content">{detail}</small>}</span></Link>; })}</div> : <p className="home-today-empty">{english ? "No timeline records on this day" : "这一天还没有 Timeline 记录"}</p>}</section>
    </>}
    <HomeQuickLog selectedDate={selected} onSaved={refreshSelectedDate} />
  </section>;
}
