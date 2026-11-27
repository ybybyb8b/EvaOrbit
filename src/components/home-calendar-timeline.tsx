"use client";
import {HomeTasksSummary} from "@/components/home-tasks-summary";
import type {DueReminder} from "@/lib/types";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ArrowDown5, ArrowLeft2, ArrowRight2 } from "reicon-react";
import { FormSheet } from "@/components/form-sheet";

import { calendarCategoryLabel, matchingCalendarRule, type CalendarRule } from "@/lib/calendar-interpretation";
import type { HomeDayOverview } from "@/lib/home-day";
import type { UiLanguage } from "@/lib/locale";
import { playNativeHaptic } from "@/lib/native-haptics";
import { EVAORBIT_TIME_ZONE, dateInEvaOrbit, dateRange, shiftDate } from "@/lib/time";
import { periodDayForDate } from "@/lib/timeline";
import { buildCalendarTimelineEvents, calendarTimelineRangeLabel, timelineDurationLabel } from "@/lib/calendar-timeline";
import { TimelineAssociationSheet } from "./timeline-association-sheet";
import { HomeDayTimeline, type TimelineEntryView } from "./home-day-timeline";
import type { FoodLog, CalendarEvent, TimelineEvent, TimelineMonthSummary } from "@/lib/types";

import { homeCacheChanged, readHomeSnapshot as cachedRead, saveHomeSnapshot as cachedSave } from "@/lib/home-cache";
import capsuleStyles from "@/app/home-calendar-timeline.module.css";

const sourceMeta: Record<TimelineEvent["sourceType"], { en: string; zh: string }> = {
  calendar: { en: "Calendar", zh: "日历" },
  food: { en: "Food", zh: "吃吃" }, drink: { en: "Drinks", zh: "喝喝" }, tracker: { en: "Trackers", zh: "观测" }, cat: { en: "Cats", zh: "咪子" }, health: { en: "Health", zh: "体征" }, training: { en: "Training", zh: "训练" }, person: { en: "Relations", zh: "她们" }, subscription: { en: "Subscription", zh: "订阅" }, media: { en: "Media", zh: "展架" }, chronicle: { en: "Chronicle", zh: "纪事" },
};
const mealLabels: Record<string, { en: string; zh: string }> = { breakfast: { en: "Breakfast", zh: "早餐" }, lunch: { en: "Lunch", zh: "午餐" }, dinner: { en: "Dinner", zh: "晚餐" }, snack: { en: "Snack", zh: "加餐" }, late_night: { en: "Late night", zh: "夜宵" } };
const trainingLabels: Record<string, { en: string; zh: string }> = { cardio: { en: "Cardio", zh: "有氧训练" }, strength: { en: "Strength", zh: "无氧训练" }, mixed: { en: "Mixed training", zh: "混合训练" } };
const flowLabels: Record<string, { en: string; zh: string }> = { none: { en: "No flow", zh: "无经量" }, unspecified: { en: "Flow not specified", zh: "经量未指定" }, light: { en: "Light", zh: "少量" }, medium: { en: "Medium", zh: "中等" }, heavy: { en: "Heavy", zh: "大量" } };
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
export type HomeTimelineProps = { initialDay:HomeDayOverview;dueItems?:DueReminder[];initialSummary:TimelineMonthSummary;language:UiLanguage;cacheScope:string;readOnly?:boolean;LinkComponent?:ComponentType<HomeLinkProps>;RuleEditor?:typeof import("./calendar-rule-sheet").CalendarRuleSheet;LogScope?:typeof import("./bottom-log").BottomLogScope;widgetStack?:ReactNode;dataSource?:{read:typeof cachedRead;save:typeof cachedSave} };
export function HomeCalendarTimeline({ initialDay, initialSummary, dueItems:initialDueItems, language, cacheScope, readOnly=false, LinkComponent=PlainLink, RuleEditor, LogScope, dataSource, widgetStack }:HomeTimelineProps) {
  const businessFetch=useBusinessRequest();
  const Link=LinkComponent, CalendarRuleSheet=RuleEditor ?? EmptySlot, BottomLogScope=LogScope ?? EmptySlot;
  const readHomeSnapshot=dataSource?.read ?? cachedRead,saveHomeSnapshot=dataSource?.save ?? cachedSave;
  const english = language === "en";
  const [today, setToday] = useState(readOnly ? dateInEvaOrbit() : initialDay.date);
  const [month, setMonth] = useState(initialSummary.month), [summaries, setSummaries] = useState<Record<string, TimelineMonthSummary>>({ [initialSummary.month]: initialSummary });
  const [selected, setSelected] = useState(initialDay.date), [calendarExpanded, setCalendarExpanded] = useState(false);
  const [days, setDays] = useState<Record<string, HomeDayOverview>>({ [initialDay.date]: initialDay });
  const [dueOverride,setDueOverride]=useState<{source:typeof initialDueItems;items:DueReminder[]}>();
  const dueItems=dueOverride?.source===initialDueItems ? dueOverride?.items : initialDueItems;
  const dueRefresh=useRef<AbortController|null>(null);
  const [loadingDate, setLoadingDate] = useState<string | null>(null), [loadingMonth, setLoadingMonth] = useState(false), [error, setError] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [calendarDetail, setCalendarDetail] = useState<TimelineEvent | null>(null);
  const [mealDetail, setMealDetail] = useState<TimelineEvent | null>(null);
  const [associationDetail, setAssociationDetail] = useState<TimelineEvent["association"] | null>(null);
  const [ruleEditor, setRuleEditor] = useState<{ rule?: CalendarRule } | null>(null);
  const dayRequest = useRef<AbortController | null>(null), monthRequest = useRef<AbortController | null>(null), day = days[selected], events = day?.events ?? [];
  const backgroundMonthRequest = useRef<AbortController | null>(null), nativeRefreshRequest = useRef<AbortController | null>(null);
  const detailRule = calendarDetail && day ? matchingCalendarRule(calendarDetail.title, day.calendarInterpretation, true) : null;
  const detailCategory = day?.calendarInterpretation.categories.find(category => category.id === detailRule?.categoryId);
  const [year, monthNumber] = month.split("-").map(Number), leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7, dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), selectedWeekStart = startOfWeek(selected);
  const visibleWeek = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedWeekStart, index)), [selectedWeekStart]);
  const weekSummariesReady = visibleWeek.every((date) => summaries[date.slice(0, 7)]);
  const weekdays = english ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const periods = useMemo(() => [...new Map(Object.values(summaries).flatMap((summary) => summary.periods ?? []).map((period) => [period.id, period])).values()], [summaries]);
  const periodContext = periodDayForDate(periods, selected, today), periodFlow = events.find((item) => item.eventType === "health.menstrual_flow" && item.metadata.periodId === periodContext?.period.id), periodDose = events.find((item) => item.eventType === "health.medication_dose" && item.metadata.periodId === periodContext?.period.id);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const updateToday = () => {
      clearTimeout(timer);
      const now = new Date(), date = dateInEvaOrbit(now);
      setToday(date);
      timer = setTimeout(updateToday, Date.parse(dateRange(date).to) - now.getTime());
    };
    timer = setTimeout(updateToday, 0);
    document.addEventListener("visibilitychange", updateToday);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", updateToday); };
  }, []);

  const refreshChangedData = useEffectEvent(async () => {
    const date = selected, requiredMonths = calendarExpanded ? [month] : [...new Set(visibleWeek.map(value => value.slice(0, 7)))];
    const needsDay = Boolean(dataSource) || readOnly || date !== initialDay.date;
    const monthsToRead = requiredMonths.filter(value => Boolean(dataSource) || readOnly || value !== initialSummary.month);
    nativeRefreshRequest.current?.abort(); dayRequest.current?.abort(); monthRequest.current?.abort(); backgroundMonthRequest.current?.abort();
    const controller = new AbortController(); nativeRefreshRequest.current = controller;
    // Invalidate other cached dates without resetting selection, expansion or unsaved drafts.
    setDays(current => current[date] ? { [date]: current[date] } : {});
    setSummaries(current => Object.fromEntries(Object.entries(current).filter(([value]) => requiredMonths.includes(value))));
    try {
      const [nextDay, nextSummaries] = await Promise.all([
        needsDay ? readHomeSnapshot<HomeDayOverview>(cacheScope, `/api/home-day?date=${date}`, controller.signal, () => {}, true) : Promise.resolve(null),
        Promise.all(monthsToRead.map(value => readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${value}`, controller.signal, () => {}, true))),
      ]);
      const next = { day: nextDay, summaries: nextSummaries };
      if (controller.signal.aborted) return;
      if (next.day) { const day = next.day; setDays(current => ({...current,[date]:day})); }
      setSummaries(current => ({...current,...Object.fromEntries(next.summaries.map(summary => [summary.month, summary]))}));
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
      dueRefresh.current?.abort();
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

  async function loadDay(date: string, force = date === today && date !== initialDay.date) {
    setRefreshFailed(false);
    setSelected(date); setError("");
    dayRequest.current?.abort(); const controller = new AbortController(); dayRequest.current = controller; setLoadingDate(date);
    try { const show = (result: HomeDayOverview) => setDays(current => ({ ...current, [date]: result })); const result = await readHomeSnapshot<HomeDayOverview>(cacheScope, `/api/home-day?date=${date}`, controller.signal, show, force); if (!controller.signal.aborted) show(result); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this day" : "无法读取这一天"); }
    finally { if (dayRequest.current === controller) setLoadingDate(null); }
  }
  async function refreshDay(date:string, invalidateRules = false) {
    try { const signal = new AbortController().signal; const [nextDay, summary] = await Promise.all([readHomeSnapshot<HomeDayOverview>(cacheScope, `/api/home-day?date=${date}`, signal, () => {}, true), readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${date.slice(0, 7)}`, signal, () => {}, true)]); setDays((current) => ({ ...(invalidateRules ? {} : current), [date]: nextDay })); setSummaries((current) => ({ ...current, [summary.month]: summary })); setRefreshFailed(false); }
    catch (reason) { if ((reason as Error)?.name !== "AbortError") setError(english ? "Saved, but this day could not refresh" : "已保存，但这一天刷新失败"); }
  }
  function refreshSelectedDate(invalidateRules=false){return refreshDay(selected,invalidateRules);}
  async function refreshTasks(completedOn?:string) {
    dueRefresh.current?.abort();
    const controller=new AbortController();
    dueRefresh.current=controller;
    await Promise.all([
      refreshSelectedDate(),
      completedOn&&completedOn!==selected ? refreshDay(completedOn) : Promise.resolve(),
      (async()=>{
        try {
          const path="/api/reminders/due";
          const items=dataSource
            ? await readHomeSnapshot<DueReminder[]>(cacheScope,path,controller.signal,()=>{},true)
            : await businessFetch(path,{cache:"no-store",signal:controller.signal}).then(async response=>{
              if(!response.ok)throw new Error("Could not refresh reminders");
              return await response.json() as DueReminder[];
            });
          if(!controller.signal.aborted)setDueOverride({source:initialDueItems,items});
        } catch { /* The most recent available snapshot is still usable. */ }
      })(),
    ]);
  }
  async function changeMonth(nextMonth: string) {
    monthRequest.current?.abort(); const controller = new AbortController(); monthRequest.current = controller; setLoadingMonth(true); setError("");
    setMonth(nextMonth); playNativeHaptic("selection");
    const nextDate = today.startsWith(nextMonth) ? today : `${nextMonth}-01`;
    try { const show = (result: TimelineMonthSummary) => setSummaries(current => ({ ...current, [nextMonth]: result })); await Promise.all([loadDay(nextDate), readHomeSnapshot<TimelineMonthSummary>(cacheScope, `/api/timeline?month=${nextMonth}`, controller.signal, show).then(result => { if (!controller.signal.aborted) show(result); })]); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this month" : "无法读取这个月份"); }
    finally { if (monthRequest.current === controller) setLoadingMonth(false); }
  }
  function selectCalendarDate(date: string) { setMonth(date.slice(0, 7)); playNativeHaptic("selection"); void loadDay(date); }
  function returnToToday() { const todayMonth = today.slice(0, 7); if (month !== todayMonth) void changeMonth(todayMonth); else { playNativeHaptic("selection"); void loadDay(today); } }
  function moveCalendar(offset: number) { if (calendarExpanded) void changeMonth(shiftMonth(month, offset)); else selectCalendarDate(shiftDate(selected, offset * 7)); }
  function calendarDay(date: string) {
    const daySummary = calendarExpanded || weekSummariesReady ? summaries[date.slice(0, 7)]?.days[date] : undefined, context = periodDayForDate(periods, date, today), count = daySummary?.count ?? 0, periodLabel = context ? english ? `, period day ${context.day}` : `，经期第 ${context.day} 天` : "";
    const indicator=<span className="home-calendar-indicator" aria-hidden="true">{count > 0 && <i />}</span>;
    const weekday = weekdays[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
    return <button type="button" key={date} className={selected === date ? "selected" : ""} data-today={date === today} data-before-today={date < today} data-has-record={count > 0} data-highlighted={daySummary?.highlighted === true} data-outside-month={date.slice(0, 7) !== month} data-period={Boolean(context)} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} aria-label={`${date}${periodLabel}${count ? english ? `, ${count} entries` : `，${count} 条记录` : english ? ", no entries" : "，没有记录"}`} onClick={() => selectCalendarDate(date)}><span className={`${capsuleStyles.pill} home-date-pill`}><span className={`${capsuleStyles.weekday} home-date-weekday`}>{weekday}</span><strong>{Number(date.slice(-2))}</strong>{indicator}</span></button>;
  }

  function renderTimelineEntry(item: TimelineEvent, view: TimelineEntryView, onOpen?: () => void) {
    const source = sourceMeta[item.sourceType];
    const calendar = item.sourceType === "calendar";
    const meal = item.metadata.calendarMeal as FoodLog["calendarMeal"];
    const start = meal?.startAt ?? item.occurredAt;
    const end = meal?.endAt ?? item.endAt;
    const hasDuration = Boolean(end && Date.parse(end) > Date.parse(start));
    const time = view === "untimed" ? null : calendar ? calendarTimelineRangeLabel(item, english, selected) :
      hasDuration ? `${timeLabel(start)}–${timeLabel(end!)}` : timeLabel(start);
    const association = item.association;
    const detail = association ? `${association.tracker.name} · ${english ? "2 associated records" : "2 条关联记录"}` : detailFor(item, english);
    const sourceLabel = english ? source.en : source.zh;
    const tentative = calendar && item.metadata.status === "tentative" ? english ? "Tentative" : "待定" : null;
    const subtitle = view === "axis" ? [time?.split(" · ")[0], tentative,
      detail || (hasDuration ? null : sourceLabel)].filter(Boolean).join(" · ") : [time, sourceLabel,
      tentative, meal && view === "details" ? timelineDurationLabel(item) : null,
      meal ? english ? "Time from Calendar" : "时间来自日历" : null, detail].filter(Boolean).join(" · ");
    const content = <span className={capsuleStyles.entryCopy}><strong className="user-content">{titleFor(item, english)}</strong><small className="user-content">{subtitle}</small></span>;
    const className = `${capsuleStyles.timelineEntry} home-timeline-entry`;
    if (calendar || meal || association) return <button type="button" id={calendar ? `calendar-event-${item.sourceId}` : undefined} className={className} aria-haspopup="dialog" onClick={() => {
      onOpen?.();
      if (association) setAssociationDetail(association);
      else if (meal) setMealDetail(item);
      else setCalendarDetail(item);
    }}>{content}</button>;
    return <Link href={item.href} className={className}>{content}</Link>;
  }

  return <section className={`today-focus home-calendar-card ${capsuleStyles.capsules}`} aria-label={english ? "Calendar and daily overview" : "日历与每日概览"}>
    <section className="home-calendar" aria-label={english ? "Calendar" : "日历"}>
      <header className="home-calendar-header"><h2>{monthLabel}</h2><div className="home-calendar-actions">{selected !== today && <button type="button" className="home-calendar-today" onClick={returnToToday} disabled={loadingMonth}>{english ? "Today" : "今天"}</button>}<button type="button" className="home-calendar-previous" aria-label={calendarExpanded ? english ? "Previous month" : "上个月" : english ? "Previous week" : "上一周"} disabled={loadingMonth} onClick={() => moveCalendar(-1)}><ArrowLeft2 className="home-calendar-action-icon" size={15} weight="Outline" aria-hidden="true" /></button><button type="button" className="home-calendar-next" aria-label={calendarExpanded ? english ? "Next month" : "下个月" : english ? "Next week" : "下一周"} disabled={loadingMonth} onClick={() => moveCalendar(1)}><ArrowRight2 className="home-calendar-action-icon" size={15} weight="Outline" aria-hidden="true" /></button><button type="button" className="home-calendar-toggle" aria-label={calendarExpanded ? english ? "Show week" : "收起为周" : english ? "Show month" : "展开月份"} aria-expanded={calendarExpanded} onClick={() => { playNativeHaptic("selection"); setCalendarExpanded((current) => !current); }}><ArrowDown5 className="home-calendar-action-icon" size={14} weight="Outline" aria-hidden="true" /></button></div></header>
      <div className="home-calendar-grid" data-expanded={calendarExpanded} key={calendarExpanded ? month : selectedWeekStart}>{calendarExpanded && Array.from({ length: leading }, (_, index) => <span className="home-calendar-blank" key={`leading-${index}`} aria-hidden="true" />)}{(calendarExpanded ? Array.from({ length: dayCount }, (_, index) => dateFor(month, index + 1)) : visibleWeek).map(calendarDay)}</div>
    </section>
    {(error || refreshFailed) && <ErrorNotice role="alert">{error || (english ? "Synced data could not refresh. Please try again." : "同步数据刷新失败，请重试。")}</ErrorNotice>}
    {!day ? <PageLoading title="这一天" englishTitle="day" inline /> : <>
      <div className="home-day-grid home-day-grid--compact">
        <HomeTasksSummary key={selected} tasks={day.tasks} completedItems={day.completedItems} reminders={dueItems??[]} remindersAvailable={dueItems!==undefined} date={selected} readOnly={readOnly} english={english} LinkComponent={Link} onChanged={completedOn=>void refreshTasks(completedOn)}/>
      </div>
      {widgetStack}
      <section className="home-day-timeline" aria-busy={loadingDate === selected}>
        <header className="home-day-heading"><h2>{english ? "Timeline" : "时间轴"}</h2></header>
        {periodContext && <div className="home-period-context"><strong>{english ? "Period" : "经期"}</strong><span>{english ? `Day ${periodContext.day}` : `第 ${periodContext.day} 天`}</span>{periodFlow && typeof periodFlow.metadata.flow === "string" && flowLabels[periodFlow.metadata.flow] && <span>{english ? flowLabels[periodFlow.metadata.flow].en : flowLabels[periodFlow.metadata.flow].zh}</span>}{periodDose && <span>{english ? `${periodDose.title} recorded` : `已记录 ${periodDose.title}`}</span>}</div>}
        {events.length ? <HomeDayTimeline key={selected} date={selected} events={events} english={english} timeLabel={timeLabel} titleFor={item => titleFor(item, english)} renderEntry={renderTimelineEntry} /> : <p className="home-today-empty">{english ? "No timeline records on this day" : "这一天还没有时间轴记录"}</p>}
      </section>
    </>}
    <BottomLogScope selectedDate={selected} onSaved={refreshTasks} />
    {associationDetail && <TimelineAssociationSheet association={associationDetail} english={english} LinkComponent={Link} onClose={() => setAssociationDetail(null)} onCalendar={() => { const calendar = associationDetail.calendar; const range = dateRange(dateInEvaOrbit(new Date(calendar.startAt))); setCalendarDetail(buildCalendarTimelineEvents([calendar], range)[0]); setAssociationDetail(null); }} />}
    {mealDetail && <FormSheet title={titleFor(mealDetail, english)} onClose={() => setMealDetail(null)}><div className="home-time-detail"><p className="user-content">{mealDetail.detail}</p><p>{timeLabel(mealDetail.occurredAt)}–{timeLabel(mealDetail.endAt!)} · {english ? "Time from Calendar" : "时间来自日历"}</p><p className="home-time-context">{english ? "Food and Calendar describe one meal. The original Food time is preserved." : "饮食内容和日历时段已合并为同一顿饭，原饮食时间保留。"}</p><Link className="button secondary" href={mealDetail.href}>{english ? "Edit Food record" : "编辑饮食记录"}</Link>{Boolean(mealDetail.metadata.calendarEvent) && <button type="button" className="button secondary" onClick={() => { setCalendarDetail(mealDetail.metadata.calendarEvent as TimelineEvent); setMealDetail(null); }}>{english ? "View Calendar event" : "查看日历事项"}</button>}</div></FormSheet>}
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
  </section>;
}
