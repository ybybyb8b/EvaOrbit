"use client";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";

import type { ComponentType, ReactNode } from "react";
import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Add, ArrowDown5, ArrowLeft2, ArrowRight2, CheckCircle, Checklist, Edit2, ForkKnife, MoonSleep, Note, RecordCircle, Trash } from "reicon-react";
import { ReiconSymbol } from "@/components/reicon-symbol";
import { FormSheet, scrollFormSheetField } from "@/components/form-sheet";

import { calendarCategoryLabel, matchingCalendarRule, type CalendarRule } from "@/lib/calendar-interpretation";
import type { HomeDayOverview } from "@/lib/home-day";
import { homeActivityLabel, homeActivitySentence, homeDurationLabel as durationLabel } from "@/lib/home-day";
import type { UiLanguage } from "@/lib/locale";
import { playNativeHaptic } from "@/lib/native-haptics";
import { EVAORBIT_TIME_ZONE, dateInEvaOrbit, shiftDate } from "@/lib/time";
import { periodDayForDate } from "@/lib/timeline";
import { calendarTimelineRangeLabel, timelineDurationLabel } from "@/lib/calendar-timeline";
import { journalEmotions, journalMoodLabel } from "@/lib/journal-emotions";
import { journalDraftChanged, journalPreviewEntries } from "@/lib/journal-draft";
import type { DailyJournalEmotion } from "@/lib/types";
import type { FoodLog, CalendarEvent, DailyJournalEnergy, DailyJournalMood, DailyJournalEntry, TimelineEvent, TimelineMonthSummary } from "@/lib/types";
import { buildDailySleepSummary } from "@/lib/sleep";
import { SleepSummary, SleepOverviewPreview } from "@/components/sleep-summary";

import { homeCacheChanged, readHomeSnapshot as cachedRead, saveHomeSnapshot as cachedSave } from "@/lib/home-cache";
import capsuleStyles from "@/app/home-calendar-timeline.module.css";

const sourceMeta: Record<TimelineEvent["sourceType"], { en: string; zh: string }> = {
  calendar: { en: "Calendar", zh: "日历" },
  food: { en: "Food", zh: "吃吃" }, drink: { en: "Drinks", zh: "喝喝" }, tracker: { en: "Trackers", zh: "观测" }, cat: { en: "Cats", zh: "咪子" }, health: { en: "Health", zh: "体征" }, training: { en: "Training", zh: "训练" }, person: { en: "Relations", zh: "她们" }, subscription: { en: "Subscription", zh: "订阅" }, media: { en: "Media", zh: "展架" }, chronicle: { en: "Chronicle", zh: "纪事" },
};
const mealLabels: Record<string, { en: string; zh: string }> = { breakfast: { en: "Breakfast", zh: "早餐" }, lunch: { en: "Lunch", zh: "午餐" }, dinner: { en: "Dinner", zh: "晚餐" }, snack: { en: "Snack", zh: "加餐" }, late_night: { en: "Late night", zh: "夜宵" } };
const trainingLabels: Record<string, { en: string; zh: string }> = { cardio: { en: "Cardio", zh: "有氧训练" }, strength: { en: "Strength", zh: "无氧训练" }, mixed: { en: "Mixed training", zh: "混合训练" } };
const flowLabels: Record<string, { en: string; zh: string }> = { none: { en: "No flow", zh: "无经量" }, unspecified: { en: "Flow not specified", zh: "经量未指定" }, light: { en: "Light", zh: "少量" }, medium: { en: "Medium", zh: "中等" }, heavy: { en: "Heavy", zh: "大量" } };
const energyOptions: Array<{ value: DailyJournalEnergy; en: string; zh: string }> = [
  { value: 1, en: "Tired", zh: "疲惫" }, { value: 2, en: "Okay", zh: "一般" }, { value: 3, en: "Energetic", zh: "充沛" },
];

function JournalState({ entry, english }: { entry: DailyJournalEntry; english: boolean }) {
  const mood = journalMoodLabel(entry);
  const energy = energyOptions.find((option) => option.value === entry.energyLevel);
  if (!mood && !energy) return null;
  return <span className="home-journal-state">{mood && <span><span aria-hidden="true">{mood.emoji}</span>{english ? mood.en : mood.zh}</span>}{energy && <span>{english ? `Energy: ${energy.en}` : `精力${energy.zh}`}</span>}</span>;
}

function FullDiaryStatus({ english, compact = false }: { english: boolean; compact?: boolean }) {
  return <span className={`home-journal-full-diary${compact ? " home-journal-full-diary--compact" : ""}`} title={english ? "Full diary written for this day" : "今日有完整日记"}><CheckCircle size={compact ? 15 : 17} weight="Outline" aria-hidden="true" />{compact ? english ? "Full diary" : "完整日记" : english ? "Full diary written" : "完整日记已写"}</span>;
}

function shiftMonth(month: string, offset: number) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value - 1 + offset, 1, 12)).toISOString().slice(0, 7); }

function startOfWeek(date: string) { const value = new Date(`${date}T12:00:00Z`); return shiftDate(date, -((value.getUTCDay() + 6) % 7)); }
function dateFor(month: string, day: number) { return `${month}-${String(day).padStart(2, "0")}`; }
function timeLabel(value: string, timeZone = EVAORBIT_TIME_ZONE) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(value)); }
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

export type HomeLinkProps = {href:string;className?:string;children?:ReactNode};
const PlainLink = (props:HomeLinkProps) => <a {...props}/>;
const EmptySlot = () => null;
export type HomeTimelineProps = { initialDay:HomeDayOverview;initialSummary:TimelineMonthSummary;language:UiLanguage;cacheScope:string;readOnly?:boolean;LinkComponent?:ComponentType<HomeLinkProps>;RuleEditor?:typeof import("./calendar-rule-sheet").CalendarRuleSheet;LogScope?:typeof import("./bottom-log").BottomLogScope;dataSource?:{read:typeof cachedRead;save:typeof cachedSave} };
export function HomeCalendarTimeline({ initialDay, initialSummary, language, cacheScope, readOnly=false, LinkComponent=PlainLink, RuleEditor, LogScope, dataSource }:HomeTimelineProps) {
  const Link=LinkComponent, CalendarRuleSheet=RuleEditor ?? EmptySlot, BottomLogScope=LogScope ?? EmptySlot;
  const readHomeSnapshot=dataSource?.read ?? cachedRead,saveHomeSnapshot=dataSource?.save ?? cachedSave;
  const english = language === "en", today = readOnly ? dateInEvaOrbit() : initialDay.date;
  const [month, setMonth] = useState(initialSummary.month), [summaries, setSummaries] = useState<Record<string, TimelineMonthSummary>>({ [initialSummary.month]: initialSummary });
  const [selected, setSelected] = useState(initialDay.date), [calendarExpanded, setCalendarExpanded] = useState(false), [timelineExpanded, setTimelineExpanded] = useState(false);
  const [days, setDays] = useState<Record<string, HomeDayOverview>>({ [initialDay.date]: initialDay });
  const [loadingDate, setLoadingDate] = useState<string | null>(null), [loadingMonth, setLoadingMonth] = useState(false), [error, setError] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [journalContent, setJournalContent] = useState(""), [journalMood, setJournalMood] = useState<DailyJournalMood | null>(null), [editingJournalId, setEditingJournalId] = useState<number | null>(null), [savingJournal, setSavingJournal] = useState(false);
  const [journalSheetOpen, setJournalSheetOpen] = useState(false);
  const [journalHistoryOpen, setJournalHistoryOpen] = useState(false);
  const [journalEnergy, setJournalEnergy] = useState<DailyJournalEnergy | null>(null);
  const [journalEmotion, setJournalEmotion] = useState<DailyJournalEmotion | null>(null);
  const [journalFullDiary, setJournalFullDiary] = useState(false);
  const [journalDeleteId, setJournalDeleteId] = useState<number | null>(null);
  const journalInput = useRef<HTMLTextAreaElement | null>(null);
  const journalConfirm = useRef<HTMLButtonElement | null>(null);
  const [activitySheetOpen, setActivitySheetOpen] = useState(false);
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false);
  const [calendarDetail, setCalendarDetail] = useState<TimelineEvent | null>(null);
  const [mealDetail, setMealDetail] = useState<TimelineEvent | null>(null);
  const [ruleEditor, setRuleEditor] = useState<{ rule?: CalendarRule } | null>(null);
  const dayRequest = useRef<AbortController | null>(null), monthRequest = useRef<AbortController | null>(null), day = days[selected], events = day?.events ?? [];
  const backgroundMonthRequest = useRef<AbortController | null>(null), nativeRefreshRequest = useRef<AbortController | null>(null);
  const sleepSummary = day ? day.sleepSummary ?? buildDailySleepSummary(day.date, [], day.sleep) : null;
  const activitySentence = day ? homeActivitySentence(day.activities, english, selected === today) : null;
  const journalDirty = journalDraftChanged({ content: journalContent, moodScore: journalMood, emotion: journalEmotion, energyLevel: journalEnergy, hasFullDiary: journalFullDiary }, day?.journal.find(entry => entry.id === editingJournalId));
  const draftMood = journalMoodLabel({ emotion: journalEmotion, moodScore: journalMood });
  const draftEnergy = energyOptions.find(option => option.value === journalEnergy);
  const detailRule = calendarDetail && day ? matchingCalendarRule(calendarDetail.title, day.calendarInterpretation, true) : null;
  const detailCategory = day?.calendarInterpretation.categories.find(category => category.id === detailRule?.categoryId);
  const [year, monthNumber] = month.split("-").map(Number), leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7, dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), selectedWeekStart = startOfWeek(selected);
  const visibleWeek = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedWeekStart, index)), [selectedWeekStart]);
  const weekSummariesReady = visibleWeek.every((date) => summaries[date.slice(0, 7)]);
  const weekdays = english ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const selectedLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${selected}T12:00:00Z`));
  const periods = useMemo(() => [...new Map(Object.values(summaries).flatMap((summary) => summary.periods ?? []).map((period) => [period.id, period])).values()], [summaries]);
  const periodContext = periodDayForDate(periods, selected, today), periodFlow = events.find((item) => item.eventType === "health.menstrual_flow" && item.metadata.periodId === periodContext?.period.id), periodDose = events.find((item) => item.eventType === "health.medication_dose" && item.metadata.periodId === periodContext?.period.id);

  const refreshChangedData = useEffectEvent(async () => {
    const date = selected, requiredMonths = calendarExpanded ? [month] : [...new Set(visibleWeek.map(value => value.slice(0, 7)))];
    nativeRefreshRequest.current?.abort(); dayRequest.current?.abort(); monthRequest.current?.abort(); backgroundMonthRequest.current?.abort();
    const controller = new AbortController(); nativeRefreshRequest.current = controller;
    // Invalidate other cached dates without resetting selection, expansion or unsaved drafts.
    setDays(current => current[date] ? { [date]: current[date] } : {});
    setSummaries(current => Object.fromEntries(Object.entries(current).filter(([value]) => requiredMonths.includes(value))));
    try {
      const [nextDay, nextSummaries] = await Promise.all([
        readHomeSnapshot<HomeDayOverview>(cacheScope, `/api/home-day?date=${date}`, controller.signal, () => {}, true),
        Promise.all(requiredMonths.map(value => readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${value}`, controller.signal, () => {}, true))),
      ]);
      const next = { day: nextDay, summaries: nextSummaries };
      if (controller.signal.aborted) return;
      setDays({ [date]: next.day }); setSummaries(Object.fromEntries(next.summaries.map(summary => [summary.month, summary])));
      setRefreshFailed(false);
    } catch (reason) {
      if (!controller.signal.aborted && (reason as Error)?.name !== "AbortError") setRefreshFailed(true);
    }
  });
  useEffect(() => {
    void saveHomeSnapshot(cacheScope, `/api/home-day?date=${initialDay.date}`, initialDay);
    void saveHomeSnapshot(cacheScope, `/api/timeline?month=${initialSummary.month}`, initialSummary);
    let alive = true;
    queueMicrotask(() => { if (alive) { setDays(current => ({ ...current, [initialDay.date]: initialDay })); setSummaries(current => ({ ...current, [initialSummary.month]: initialSummary })); } });
    return () => { alive = false; };
  }, [cacheScope, initialDay, initialSummary, saveHomeSnapshot]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void refreshChangedData(); }, 100); };
    const changedStorage = (event: StorageEvent) => { if (event.key === "eo:home-revision" || event.key === null) refresh(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener(homeCacheChanged, refresh);
    window.addEventListener("storage", changedStorage);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(homeCacheChanged, refresh);
      window.removeEventListener("storage", changedStorage);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      dayRequest.current?.abort(); monthRequest.current?.abort(); nativeRefreshRequest.current?.abort();
    };
  }, []);
  useEffect(() => () => nativeRefreshRequest.current?.abort(), [selected, month, calendarExpanded]);

  useEffect(() => {
    if (loadingMonth) return;
    const requiredMonths = calendarExpanded ? [month] : [...new Set(visibleWeek.map((date) => date.slice(0, 7)))], missingMonths = requiredMonths.filter((value) => !summaries[value]);
    if (!missingMonths.length) return;
    const controller = new AbortController();
    backgroundMonthRequest.current = controller;
    void Promise.all(missingMonths.map(value => readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${value}`, controller.signal, () => {}))).then((results) => { if (!controller.signal.aborted) setSummaries((current) => Object.fromEntries([...Object.entries(current), ...results.map((result) => [result.month, result])])); }).catch(() => undefined);
    return () => controller.abort();
  }, [calendarExpanded, month, summaries, visibleWeek, cacheScope, loadingMonth, readHomeSnapshot]);

  async function loadDay(date: string, force = false) {
    setRefreshFailed(false);
    setSelected(date); setTimelineExpanded(false); setError(""); setEditingJournalId(null); setJournalContent(""); setJournalMood(null); setJournalEmotion(null); setJournalEnergy(null); setJournalFullDiary(false);
    dayRequest.current?.abort(); const controller = new AbortController(); dayRequest.current = controller; setLoadingDate(date);
    try { const show = (result: HomeDayOverview) => setDays(current => ({ ...current, [date]: result })); const result = await readHomeSnapshot<HomeDayOverview>(cacheScope, `/api/home-day?date=${date}`, controller.signal, show, force); if (!controller.signal.aborted) show(result); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this day" : "无法读取这一天"); }
    finally { if (dayRequest.current === controller) setLoadingDate(null); }
  }
  async function refreshSelectedDate(invalidateRules = false) {
    const date = selected;
    try { const signal = new AbortController().signal; const [nextDay, summary] = await Promise.all([readHomeSnapshot<HomeDayOverview>(cacheScope, `/api/home-day?date=${date}`, signal, () => {}, true), readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${date.slice(0, 7)}`, signal, () => {}, true)]); setDays((current) => ({ ...(invalidateRules ? {} : current), [date]: nextDay })); setSummaries((current) => ({ ...current, [summary.month]: summary })); setRefreshFailed(false); }
    catch (reason) { if ((reason as Error)?.name !== "AbortError") setError(english ? "Saved, but this day could not refresh" : "已保存，但这一天刷新失败"); }
  }
  async function changeMonth(nextMonth: string) {
    monthRequest.current?.abort(); const controller = new AbortController(); monthRequest.current = controller; setLoadingMonth(true); setError("");
    setMonth(nextMonth); playNativeHaptic("selection");
    const nextDate = today.startsWith(nextMonth) ? today : `${nextMonth}-01`;
    try { const show = (result: TimelineMonthSummary) => setSummaries(current => ({ ...current, [nextMonth]: result })); await Promise.all([loadDay(nextDate), readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${nextMonth}`, controller.signal, show).then(result => { if (!controller.signal.aborted) show(result); })]); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this month" : "无法读取这个月份"); }
    finally { if (monthRequest.current === controller) setLoadingMonth(false); }
  }
  async function saveJournal(event: FormEvent) {
    event.preventDefault(); if (readOnly || !journalContent.trim() || journalHistoryOpen || journalDeleteId !== null || savingJournal) return; setSavingJournal(true); setError("");
    try { const response = await fetch(editingJournalId ? `/api/daily-journal/${editingJournalId}` : "/api/daily-journal", { method: editingJournalId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(!editingJournalId && { date: selected }), content: journalContent, moodScore: journalMood, emotion: journalEmotion, energyLevel: journalEnergy, hasFullDiary: journalFullDiary }) }); if (!response.ok) throw new Error(); closeJournalSheet(); await refreshSelectedDate(); }
    catch { setError(english ? "Could not save. Your note is still here; please try again." : "保存失败，内容仍保留在这里，请重试。"); } finally { setSavingJournal(false); }
  }
  async function removeJournal(id: number) {
    if (readOnly) return;
    setError(""); setSavingJournal(true); try { const response = await fetch(`/api/daily-journal/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error(); closeJournalSheet(); await refreshSelectedDate(); } catch { setError(english ? "Could not delete. Please try again." : "删除失败，请重试。"); } finally { setSavingJournal(false); }
  }
  function applyJournalEdit(entry: DailyJournalEntry | null) {
    setJournalHistoryOpen(false);
    setEditingJournalId(entry?.id ?? null); setJournalContent(entry?.content ?? ""); setJournalMood(entry?.moodScore ?? null); setJournalEmotion(entry?.emotion ?? null); setJournalEnergy(entry?.energyLevel ?? null); setJournalFullDiary(entry?.hasFullDiary ?? false); setError("");
    if (journalSheetOpen && !readOnly) window.requestAnimationFrame(() => { const input = journalInput.current; if (input) { input.focus({ preventScroll: true }); scrollFormSheetField(input.closest(".form-sheet-body"), input); } });
  }
  function requestJournalDelete(id: number) {
    if (readOnly || savingJournal) return;
    setJournalDeleteId(id);
    window.requestAnimationFrame(() => { const button = journalConfirm.current; if (button) { button.focus({ preventScroll: true }); scrollFormSheetField(button.closest(".form-sheet-body"), button); } });
  }
  function openJournalSheet(entry: DailyJournalEntry | null = null, showHistory = false) { applyJournalEdit(entry); setJournalDeleteId(null); setJournalHistoryOpen(showHistory); setJournalSheetOpen(true); }
  function closeJournalSheet() { setJournalSheetOpen(false); setJournalHistoryOpen(false); setJournalDeleteId(null); setEditingJournalId(null); setJournalContent(""); setJournalMood(null); setJournalEmotion(null); setJournalEnergy(null); setJournalFullDiary(false); }
  function selectCalendarDate(date: string) { setMonth(date.slice(0, 7)); playNativeHaptic("selection"); void loadDay(date); }
  function returnToToday() { const todayMonth = today.slice(0, 7); if (month !== todayMonth) void changeMonth(todayMonth); else { playNativeHaptic("selection"); void loadDay(today); } }
  function moveCalendar(offset: number) { if (calendarExpanded) void changeMonth(shiftMonth(month, offset)); else selectCalendarDate(shiftDate(selected, offset * 7)); }
  function calendarDay(date: string) {
    const daySummary = calendarExpanded || weekSummariesReady ? summaries[date.slice(0, 7)]?.days[date] : undefined, context = periodDayForDate(periods, date, today), count = daySummary?.count ?? 0, periodLabel = context ? english ? `, period day ${context.day}` : `，经期第 ${context.day} 天` : "";
    const weekday = weekdays[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
    return <button type="button" key={date} className={selected === date ? "selected" : ""} data-today={date === today} data-has-record={count > 0} data-highlighted={daySummary?.highlighted === true} data-outside-month={date.slice(0, 7) !== month} data-period={Boolean(context)} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} aria-label={`${date}${periodLabel}${count ? english ? `, ${count} entries` : `，${count} 条记录` : english ? ", no entries" : "，没有记录"}`} onClick={() => selectCalendarDate(date)}><span className={capsuleStyles.pill}><span className={capsuleStyles.weekday}>{weekday}</span><strong>{Number(date.slice(-2))}</strong></span><span className="home-calendar-indicator" aria-hidden="true">{count > 0 && <i />}</span></button>;
  }

  return <section className={`today-focus home-calendar-card ${capsuleStyles.capsules}`} aria-label={english ? "Calendar and daily overview" : "日历与每日概览"}>
    <section className="home-calendar" aria-label={english ? "Calendar" : "日历"}>
      <header className="home-calendar-header"><h2>{monthLabel}</h2><div className="home-calendar-actions">{selected !== today && <button type="button" className="home-calendar-today" onClick={returnToToday} disabled={loadingMonth}>{english ? "Today" : "今天"}</button>}<button type="button" className="home-calendar-previous" aria-label={calendarExpanded ? english ? "Previous month" : "上个月" : english ? "Previous week" : "上一周"} disabled={loadingMonth} onClick={() => moveCalendar(-1)}><ArrowLeft2 className="home-calendar-action-icon" size={15} weight="Outline" aria-hidden="true" /></button><button type="button" className="home-calendar-next" aria-label={calendarExpanded ? english ? "Next month" : "下个月" : english ? "Next week" : "下一周"} disabled={loadingMonth} onClick={() => moveCalendar(1)}><ArrowRight2 className="home-calendar-action-icon" size={15} weight="Outline" aria-hidden="true" /></button><button type="button" className="home-calendar-toggle" aria-label={calendarExpanded ? english ? "Show week" : "收起为周" : english ? "Show month" : "展开月份"} aria-expanded={calendarExpanded} onClick={() => { playNativeHaptic("selection"); setCalendarExpanded((current) => !current); }}><ArrowDown5 className="home-calendar-action-icon" size={14} weight="Outline" aria-hidden="true" /></button></div></header>
      <div className="home-calendar-grid" data-expanded={calendarExpanded} key={calendarExpanded ? month : selectedWeekStart}>{calendarExpanded && Array.from({ length: leading }, (_, index) => <span className="home-calendar-blank" key={`leading-${index}`} aria-hidden="true" />)}{(calendarExpanded ? Array.from({ length: dayCount }, (_, index) => dateFor(month, index + 1)) : visibleWeek).map(calendarDay)}</div>
    </section>
    <header className="home-selected-date-heading"><h2>{selected === today ? english ? "Today" : "今天" : selectedLabel}</h2></header>
    {(error || refreshFailed) && <ErrorNotice role="alert">{error || (english ? "Synced data could not refresh. Please try again." : "同步数据刷新失败，请重试。")}</ErrorNotice>}
    {!day ? <PageLoading title="这一天" englishTitle="day" inline /> : <>
      <div className="home-day-grid">
        <article className="home-day-pane home-sleep-pane"><button type="button" className="home-pane-open" onClick={() => setSleepSheetOpen(true)} aria-label={english ? "View sleep records" : "查看睡眠记录"}><header><MoonSleep size={19} weight="Outline" aria-hidden="true" /><h3>{english ? "Sleep" : "睡眠"}</h3><ArrowRight2 size={14} weight="Outline" aria-hidden="true" /></header>{sleepSummary && (sleepSummary.actual || sleepSummary.window) ? <><SleepOverviewPreview summary={sleepSummary} english={english} />{!sleepSummary.actual && <small>{english ? "Timeline estimate" : "时间线估算"} · {timeLabel(sleepSummary.window!.startAt)}–{timeLabel(sleepSummary.window!.endAt)}</small>}</> : <p className="home-pane-empty">{english ? "No sleep record ending this day" : "没有在这一天结束的睡眠记录"}</p>}</button></article>
        <article className="home-day-pane"><header><Checklist size={19} weight="Outline" aria-hidden="true" /><h3><Link href="/tasks">{english ? "Tasks" : "任务"}</Link></h3><small>{day.tasks.filter((task) => task.completed).length}/{day.tasks.length}</small></header>{day.tasks.length ? <ul className="home-pane-list">{day.tasks.slice(0, 4).map((task) => <li key={task.id} data-completed={task.completed}><Link href={`/tasks?taskId=${task.id}`}>{task.completed ? <CheckCircle size={15} weight="Outline" aria-hidden="true" /> : <RecordCircle size={15} weight="Outline" aria-hidden="true" />}<strong>{task.title}</strong>{task.dueTime && <time>{task.dueTime}</time>}</Link></li>)}</ul> : <p className="home-pane-empty">{english ? "No tasks due" : "这一天没有到期任务"}</p>}</article>
        <article className="home-day-pane"><header><ForkKnife size={19} weight="Outline" aria-hidden="true" /><h3><Link href={`/food?date=${selected}`}>{english ? "Meals" : "一日三餐"}</Link></h3></header>{day.meals.length ? <ul className="home-pane-list home-meal-list">{day.meals.map((meal, index) => <li key={`${meal.mealType}-${index}`}><Link href={`/food?date=${selected}&mealType=${encodeURIComponent(meal.mealType)}`}><span>{english ? mealLabels[meal.mealType]?.en ?? "Meal" : mealLabels[meal.mealType]?.zh ?? "饮食"}</span><strong>{meal.detail || meal.title}</strong><ArrowRight2 size={13} weight="Outline" aria-hidden="true" /></Link></li>)}</ul> : <p className="home-pane-empty">{english ? "No meals recorded" : "还没有饮食记录"}</p>}</article>
        <article className="home-day-pane home-journal-pane">
          <header><Note size={19} weight="Outline" aria-hidden="true" /><h3>{english ? "Day notes" : "今日一记"}</h3>{day.journal.some(entry => entry.hasFullDiary) && <FullDiaryStatus english={english} compact />}<button type="button" className="home-journal-add" disabled={readOnly} aria-label={english ? "Add a day note" : "新增短记"} aria-haspopup="dialog" onClick={() => openJournalSheet()}><Add size={19} weight="Outline" aria-hidden="true" /></button></header>
          {day.journal.length ? <div className="home-journal-preview-list">{journalPreviewEntries(day.journal).map(entry => <button key={entry.id} type="button" className="home-journal-preview-entry" aria-label={`${english ? "Edit note" : "编辑短记"}：${entry.content}`} aria-haspopup="dialog" onClick={() => openJournalSheet(entry)}><span className="home-journal-preview">{entry.content}</span><JournalState entry={entry} english={english} /></button>)}</div> : <p className="home-pane-empty">{english ? "Write whenever something comes to mind" : "想到什么，就记一点"}</p>}
          {day.journal.length > 3 && <button type="button" className="home-journal-view-all" aria-haspopup="dialog" onClick={() => openJournalSheet(null, true)}>{english ? `View all ${day.journal.length} notes from this day` : `查看当天全部 ${day.journal.length} 条`}<ArrowRight2 size={14} weight="Outline" aria-hidden="true" /></button>}
        </article>
      </div>
{activitySentence && <button type="button" className="home-time-summary" onClick={() => setActivitySheetOpen(true)} aria-label={`${activitySentence} ${english ? "View recorded time" : "查看已记录时段"}`}><span className="home-time-summary-copy"><span className="home-time-summary-label">{selected === today ? english ? "Recorded today" : "今天已记录" : english ? "Recorded this day" : "这一天已记录"}</span><span className="home-time-summary-values">{day.activities.filter(activity => activity.durationMinutes > 0).map(activity => {
  const label = homeActivityLabel(activity, english);
  return <span key={activity.category} className="home-time-summary-part" title={label}><span className={activity.icon ? "home-time-summary-icon" : undefined}>{activity.icon ? <ReiconSymbol name={activity.icon} size={20} /> : label}</span><strong>{durationLabel(activity.durationMinutes, english)}</strong></span>;
})}</span></span><ArrowRight2 size={17} weight="Outline" aria-hidden="true" /></button>}
      <section className="home-day-timeline" aria-busy={loadingDate === selected}><header className="home-day-heading"><h2>Timeline</h2>{events.length > 4 && <button type="button" className="section-link" onClick={() => setTimelineExpanded((current) => !current)}>{timelineExpanded ? english ? "Show less" : "收起" : english ? `Show all ${events.length}` : `查看全部 ${events.length} 条`}</button>}</header>{periodContext && <div className="home-period-context"><strong>{english ? "Period" : "经期"}</strong><span>{english ? `Day ${periodContext.day}` : `第 ${periodContext.day} 天`}</span>{periodFlow && typeof periodFlow.metadata.flow === "string" && flowLabels[periodFlow.metadata.flow] && <span>{english ? flowLabels[periodFlow.metadata.flow].en : flowLabels[periodFlow.metadata.flow].zh}</span>}{periodDose && <span>{english ? `${periodDose.title} recorded` : `已记录 ${periodDose.title}`}</span>}</div>}{events.length ? <div className="home-activity-list home-selected-day-events" key={selected}>{events.slice(0, timelineExpanded ? undefined : 4).map((item) => {
        const source = sourceMeta[item.sourceType], calendar = item.sourceType === "calendar", detail = calendar ? calendarTimelineRangeLabel(item, english, selected) : detailFor(item, english);
        const meal = item.metadata.calendarMeal as FoodLog["calendarMeal"];
        const content = <><time style={item.sourceType === "food" ? { whiteSpace: "normal" } : undefined}>{meal ? <>{timeLabel(meal.startAt)}<br />–{timeLabel(meal.endAt)}</> : item.hasExplicitTime ? timeLabel(item.occurredAt) : item.sourceType === "food" ? english ? "Time unspecified" : "未指定时间" : english ? "All day" : "全天"}</time><span className="home-activity-marker" aria-hidden="true" /><span className="home-activity-copy"><span className="home-activity-source">{english ? source.en : source.zh}{calendar && item.metadata.status === "tentative" ? english ? " · Tentative" : " · 待定" : ""}</span><strong className="user-content">{titleFor(item, english)}</strong>{detail && <small className="user-content">{detail}</small>}{meal && <small>{timeLabel(meal.startAt)}–{timeLabel(meal.endAt)}{timelineDurationLabel(item) && ` · ${timelineDurationLabel(item)}`} · {english ? "Time from Calendar" : "时间来自日历"}</small>}</span></>;
        return meal ? <button type="button" key={item.id} className="home-activity-item" data-source="food" onClick={() => setMealDetail(item)} aria-haspopup="dialog">{content}</button> : calendar ? <button type="button" id={`calendar-event-${item.sourceId}`} key={item.id} className="home-activity-item" data-source="calendar" onClick={() => setCalendarDetail(item)} aria-haspopup="dialog">{content}</button> : <Link href={item.href} key={item.id} className="home-activity-item" data-source={item.sourceType}>{content}</Link>;
      })}</div> : <p className="home-today-empty">{english ? "No timeline records on this day" : "这一天还没有 Timeline 记录"}</p>}</section>
    </>}
    {!readOnly && <BottomLogScope selectedDate={selected} onSaved={refreshSelectedDate} />}
    {mealDetail && <FormSheet title={titleFor(mealDetail, english)} onClose={() => setMealDetail(null)}><div className="home-time-detail"><p className="user-content">{mealDetail.detail}</p><p>{timeLabel(mealDetail.occurredAt)}–{timeLabel(mealDetail.endAt!)} · {english ? "Time from Calendar" : "时间来自日历"}</p><p className="home-time-context">{english ? "Food and Calendar describe one meal. The original Food time is preserved." : "饮食内容和日历时段已合并为同一顿饭，原饮食时间保留。"}</p><Link className="button secondary" href={mealDetail.href}>{english ? "Edit Food record" : "编辑饮食记录"}</Link>{Boolean(mealDetail.metadata.calendarEvent) && <button type="button" className="button secondary" onClick={() => { setCalendarDetail(mealDetail.metadata.calendarEvent as TimelineEvent); setMealDetail(null); }}>{english ? "View Calendar event" : "查看日历事项"}</button>}</div></FormSheet>}
    {sleepSheetOpen && day && <FormSheet title={english ? "Sleep records" : "睡眠记录"} onClose={() => setSleepSheetOpen(false)}><div className="home-time-detail"><p>{selectedLabel}</p>{sleepSummary && <SleepSummary summary={sleepSummary} english={english} />}<p className="home-time-context">{english ? "Calendar / 3×3 records describe sleep windows. Edit windows in 3×3 or Apple Calendar; manage measured sleep in Apple Health." : "Calendar / 3×3 记录表示睡眠窗口。请在 3×3 或 Apple Calendar 修改窗口，在 Apple Health 管理实际睡眠。"}</p>{day.sleep ? day.sleep.records.filter(record => !sleepSummary?.secondary?.some(episode => episode.window?.id === record.id)).map((record) => <section key={record.id}><header><h3>{sleepSummary?.window?.startAt === record.startAt && sleepSummary.window.endAt === record.endAt ? english ? "Main sleep window" : "主要睡眠窗口" : english ? "Unmatched sleep window" : "未关联的睡眠窗口"}</h3><span>{durationLabel(record.durationMinutes, english)}</span></header><p>{new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(record.startAt))} — {new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(record.endAt))}</p>{record.notes && <p className="user-content home-sleep-notes">{record.notes}</p>}</section>) : <p className="home-pane-empty">{english ? "No timeline sleep windows" : "没有时间线睡眠窗口"}</p>}</div></FormSheet>}
    {activitySheetOpen && day && <FormSheet title={english ? "Recorded time" : "已记录的时间"} onClose={() => setActivitySheetOpen(false)}>
      <div className="home-time-detail"><p>{selectedLabel}</p><p className="home-time-context">{english ? "Based on synced Calendar records, not a complete account of the day. Times below are limited to this date; categories may overlap." : "来自同步的 Calendar 记录，不代表全天的完整使用情况。以下时段仅计入所选日期，不同活动可能重叠。"}</p>
        {day.activities.filter((activity) => activity.durationMinutes > 0).map((activity) => <section key={activity.category}><header><h3>{homeActivityLabel(activity, english)}</h3><span>{durationLabel(activity.durationMinutes, english)}</span></header><ul>{day.activityRecords.filter((record) => record.category === activity.category).map((record) => <li key={record.id}><div><time>{timeLabel(record.startAt)} {english ? "to" : "至"} {timeLabel(record.endAt)}</time><span>{durationLabel(record.durationMinutes, english)}</span></div>{record.notes && <p>{record.notes}</p>}</li>)}</ul></section>)}
      </div>
    </FormSheet>}
    {calendarDetail && !ruleEditor && <FormSheet title={english ? "Calendar event" : "日历事项"} onClose={() => setCalendarDetail(null)}>
      <div className="home-calendar-detail">
        <h3 className="user-content">{calendarDetail.title}</h3>
        <p>{calendarTimelineRangeLabel(calendarDetail, english)}</p>
        {calendarDetail.metadata.status === "tentative" && <p>{english ? "Tentative" : "待定"}</p>}
        {Boolean(calendarDetail.metadata.location) && <p className="user-content">{english ? "Location" : "地点"} · {String(calendarDetail.metadata.location)}</p>}
        {Boolean(calendarDetail.metadata.notes) && <p className="user-content home-calendar-detail-notes">{String(calendarDetail.metadata.notes)}</p>}
        <p className="home-calendar-detail-context">{english ? "Synced Calendar event. Its presence does not confirm that it happened or was completed." : "来自同步的 Calendar 事项；出现在这里，不代表已发生或已完成。"}</p>
        {detailCategory && <p>{english ? "EO meaning" : "EO 解读"} · {calendarCategoryLabel(detailCategory, english)}{!detailRule?.enabled && (english ? " · Disabled" : " · 已停用")}</p>}
        <button className="button secondary" type="button" disabled={readOnly} onClick={() => setRuleEditor({ rule: detailRule ?? undefined })}>{detailRule ? english ? "Edit interpretation rule" : "编辑解读规则" : english ? "Define interpretation" : "定义解读方式"}</button>
        <Link href="/settings/calendar-interpretation" className="section-link">{english ? "Manage all interpretation rules" : "管理全部解读规则"}</Link>
      </div>
    </FormSheet>}
{!readOnly && ruleEditor && calendarDetail && day && <CalendarRuleSheet settings={day.calendarInterpretation} initialTitle={calendarDetail.title} rule={ruleEditor.rule} records={[calendarDetail, ...day.events.filter(event => event.sourceType === "calendar" && event.sourceId !== calendarDetail.sourceId)].map(event => ({ id: Number(event.sourceId), title: event.title, startAt: String(event.metadata.startAt), endAt: String(event.metadata.endAt), isAllDay: Boolean(event.metadata.isAllDay), notes: String(event.metadata.notes ?? ""), location: String(event.metadata.location ?? ""), timezone: typeof event.metadata.timezone === "string" ? event.metadata.timezone : null, status: event.metadata.status as CalendarEvent["status"], createdAt: "", updatedAt: "" }))} onClose={() => setRuleEditor(null)} onSaved={() => refreshSelectedDate(true)} />}
    {journalSheetOpen && day && <FormSheet title={readOnly ? english ? "View day note" : "查看短记" : journalHistoryOpen ? english ? "Saved day notes" : "当天日记" : editingJournalId !== null ? english ? "Edit note" : "编辑短记" : english ? "Add note" : "新增短记"} onClose={closeJournalSheet} formId={journalHistoryOpen ? undefined : "home-journal-form"} submitLabel={readOnly || journalHistoryOpen ? undefined : editingJournalId !== null ? english ? "Save changes" : "保存修改" : english ? "Add note" : "记下"} busy={savingJournal} dirty={journalDirty} submitDisabled={journalDeleteId !== null || !journalContent.trim() || (editingJournalId !== null && !journalDirty)}>
      <div className="home-journal-sheet">
        <time className="home-journal-date" dateTime={selected}>{selected.slice(0, 4)} · {selectedLabel}</time>
        {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
        {journalDeleteId !== null && <div className="home-journal-confirm" role="group" aria-label={english ? "Confirm deletion" : "确认删除"}>
          <p role="alert">{english ? "Delete this note? This cannot be undone." : "删除这条记录？删除后无法恢复。"}{journalDirty && (english ? " Unsaved edits will also be lost." : "尚未保存的修改也会丢弃。")}</p>
          <div><button ref={journalConfirm} className="button secondary" type="button" onClick={() => { setJournalDeleteId(null); window.requestAnimationFrame(() => journalInput.current?.focus({ preventScroll: true })); }}>{english ? "Keep editing" : "继续编辑"}</button><button className="button secondary" type="button" onClick={() => { setJournalDeleteId(null); void removeJournal(journalDeleteId); }}>{english ? "Delete note" : "删除记录"}</button></div>
        </div>}
        {journalHistoryOpen ? <div className="home-journal-entries">
          {day.journal.map(entry => <button key={entry.id} type="button" className="home-journal-entry home-journal-preview-entry" aria-label={`${english ? "Edit note" : "编辑短记"}：${entry.content}`} onClick={() => applyJournalEdit(entry)}>
            <span>
              <span className="home-journal-preview">{entry.content}</span><JournalState entry={entry} english={english} />{entry.hasFullDiary && <FullDiaryStatus english={english} />}
            </span>
            <Edit2 size={18} weight="Outline" aria-hidden="true" />
          </button>)}
          {!day.journal.length && <p className="home-pane-empty">{english ? "No notes for this day" : "这一天还没有短记"}</p>}
        </div> : <form id="home-journal-form" className="home-journal-form" onSubmit={saveJournal} inert={journalDeleteId !== null}><fieldset disabled={readOnly} className="home-journal-readonly-fields">
          <label className="field"><span>{english ? "Your note" : "内容"}</span><textarea ref={journalInput} required rows={5} value={journalContent} onChange={(event) => setJournalContent(event.target.value)} placeholder={english ? "Write whenever something comes to mind…" : "想到什么，就记一点……"} maxLength={10_000} disabled={readOnly || savingJournal} /></label>
          <div className="home-journal-optional">
            <details className="home-journal-disclosure"><summary><span>{english ? "Mood" : "心情"}</span><span>{draftMood ? `${draftMood.emoji} ${english ? draftMood.en : draftMood.zh}` : english ? "Optional" : "可选"}</span><ArrowDown5 size={15} weight="Outline" aria-hidden="true" /></summary>
              <fieldset className="home-mood-field" disabled={readOnly || savingJournal}><legend className="sr-only">{english ? "Mood (optional)" : "心情（可选）"}</legend>{journalMood !== null && !journalEmotion && <p className="home-journal-legacy-mood">{english ? "Previous mood: " : "原心情："}{english ? draftMood?.en : draftMood?.zh}<button type="button" onClick={() => setJournalMood(null)}>{english ? "Clear" : "清除"}</button></p>}<div className="home-mood-picker">{journalEmotions.map((option) => <button type="button" key={option.value} className={journalEmotion === option.value ? "selected" : ""} aria-pressed={journalEmotion === option.value} onClick={() => { setJournalMood(null); setJournalEmotion((current) => current === option.value ? null : option.value); }}><span className="home-mood-emoji" aria-hidden="true">{option.emoji}</span><span>{english ? option.en : option.zh}</span></button>)}</div></fieldset>
            </details>
            <details className="home-journal-disclosure"><summary><span>{english ? "Energy" : "精力"}</span><span>{draftEnergy ? english ? draftEnergy.en : draftEnergy.zh : english ? "Optional" : "可选"}</span><ArrowDown5 size={15} weight="Outline" aria-hidden="true" /></summary>
              <fieldset className="home-mood-field" disabled={readOnly || savingJournal}><legend className="sr-only">{english ? "Energy (optional)" : "精力（可选）"}</legend><div className="home-energy-picker">{energyOptions.map((option) => <button type="button" key={option.value} className={journalEnergy === option.value ? "selected" : ""} aria-pressed={journalEnergy === option.value} onClick={() => setJournalEnergy((current) => current === option.value ? null : option.value)}>{english ? option.en : option.zh}</button>)}</div></fieldset>
            </details>
          </div>
          <label className="home-journal-full-diary-field" title={english ? "Your full diary can be written elsewhere. This does not create a Chronicle." : "完整日记可以写在别处，不会自动生成纪事。"}><input type="checkbox" checked={journalFullDiary} onChange={(event) => setJournalFullDiary(event.target.checked)} disabled={readOnly || savingJournal} /><span>{english ? "Full diary written for this day" : selected === today ? "今日有完整日记" : "这一天有完整日记"}</span></label>
          {editingJournalId !== null && <button className="button secondary" type="button" disabled={readOnly || savingJournal} onClick={() => requestJournalDelete(editingJournalId)}><Trash size={18} weight="Outline" aria-hidden="true" />{english ? "Delete note" : "删除这条短记"}</button>}
        </fieldset></form>}
      </div>
    </FormSheet>}
  </section>;
}
