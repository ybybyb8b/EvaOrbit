"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import type { UiLanguage } from "@/lib/locale";
import { playNativeHaptic } from "@/lib/native-haptics";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import type { TimelineEvent, TimelineMonthSummary } from "@/lib/types";

const sourceMeta: Record<TimelineEvent["sourceType"], { en: string; zh: string }> = {
  food: { en: "Food", zh: "吃吃" }, drink: { en: "Drinks", zh: "喝喝" }, tracker: { en: "Trackers", zh: "观测" }, cat: { en: "Cats", zh: "咪子" },
  health: { en: "Health", zh: "体征" }, training: { en: "Training", zh: "训练" }, person: { en: "Relations", zh: "她们" }, media: { en: "Media", zh: "展架" }, chronicle: { en: "Chronicle", zh: "纪事" },
};
const mealLabels: Record<string, { en: string; zh: string }> = {
  breakfast: { en: "Breakfast", zh: "早餐" }, lunch: { en: "Lunch", zh: "午餐" }, dinner: { en: "Dinner", zh: "晚餐" }, snack: { en: "Snack", zh: "加餐" }, late_night: { en: "Late night", zh: "夜宵" },
};
const trainingLabels: Record<string, { en: string; zh: string }> = {
  cardio: { en: "Cardio", zh: "有氧训练" }, strength: { en: "Strength", zh: "无氧训练" }, mixed: { en: "Mixed training", zh: "混合训练" },
};

function shiftMonth(month: string, offset: number) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value - 1 + offset, 1, 12)).toISOString().slice(0, 7); }
function shiftDate(date: string, offset: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); }
function startOfWeek(date: string) { const value = new Date(`${date}T12:00:00Z`); return shiftDate(date, -((value.getUTCDay() + 6) % 7)); }
function dateFor(month: string, day: number) { return `${month}-${String(day).padStart(2, "0")}`; }
function timeLabel(value: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(value)); }
function titleFor(item: TimelineEvent, english: boolean) {
  if (item.sourceType === "food" && typeof item.metadata.mealType === "string") { const meal = mealLabels[item.metadata.mealType]; if (meal) return english ? meal.en : meal.zh; }
  if (item.sourceType === "training") {
    const course = typeof item.metadata.course === "string" ? item.metadata.course.trim() : "";
    const training = typeof item.metadata.trainingType === "string" ? trainingLabels[item.metadata.trainingType] : null;
    return course || (training ? english ? training.en : training.zh : english ? "Training" : "训练");
  }
  return item.title;
}

export function HomeCalendarTimeline({ initialDate, initialEvents, initialSummary, language }: { initialDate: string; initialEvents: TimelineEvent[]; initialSummary: TimelineMonthSummary; language: UiLanguage }) {
  const english = language === "en";
  const today = initialDate;
  const [month, setMonth] = useState(initialSummary.month);
  const [summaries, setSummaries] = useState<Record<string, TimelineMonthSummary>>({ [initialSummary.month]: initialSummary });
  const [selected, setSelected] = useState(initialDate);
  const [expanded, setExpanded] = useState(false);
  const [eventsByDate, setEventsByDate] = useState<Record<string, TimelineEvent[]>>({ [initialDate]: initialEvents });
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [error, setError] = useState("");
  const dayRequest = useRef<AbortController | null>(null);
  const monthRequest = useRef<AbortController | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const selectedWeekStart = startOfWeek(selected);
  const visibleWeek = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedWeekStart, index)), [selectedWeekStart]);
  const weekdays = english ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const selectedLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${selected}T12:00:00Z`));
  const events = eventsByDate[selected] ?? [];

  useEffect(() => {
    const requiredMonths = expanded ? [month] : [...new Set(visibleWeek.map((date) => date.slice(0, 7)))];
    const missingMonths = requiredMonths.filter((value) => !summaries[value]);
    if (!missingMonths.length) return;
    const controller = new AbortController();
    void Promise.all(missingMonths.map(async (value) => {
      const response = await fetch(`/api/timeline?month=${encodeURIComponent(value)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      return response.json() as Promise<TimelineMonthSummary>;
    })).then((results) => setSummaries((current) => Object.fromEntries([...Object.entries(current), ...results.map((result) => [result.month, result])]))).catch(() => undefined);
    return () => controller.abort();
  }, [expanded, month, summaries, visibleWeek]);

  async function selectDate(date: string) {
    setSelected(date); setError("");
    if (eventsByDate[date]) return;
    dayRequest.current?.abort(); const controller = new AbortController(); dayRequest.current = controller; setLoadingDate(date);
    try {
      const response = await fetch(`/api/timeline?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      const result = await response.json() as { events: TimelineEvent[] };
      setEventsByDate((current) => ({ ...current, [date]: result.events }));
    } catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this day" : "无法读取这一天"); }
    finally { if (dayRequest.current === controller) setLoadingDate(null); }
  }

  async function changeMonth(nextMonth: string) {
    monthRequest.current?.abort(); const controller = new AbortController(); monthRequest.current = controller; setLoadingMonth(true); setError("");
    try {
      const response = await fetch(`/api/timeline?month=${encodeURIComponent(nextMonth)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      const result = await response.json() as TimelineMonthSummary;
      const nextDate = today.startsWith(nextMonth) ? today : `${nextMonth}-01`;
      setMonth(nextMonth); setSummaries((current) => ({ ...current, [nextMonth]: result })); playNativeHaptic("selection"); await selectDate(nextDate);
    } catch (reason) { if ((reason as Error).name !== "AbortError") setError(english ? "Could not load this month" : "无法读取这个月份"); }
    finally { if (monthRequest.current === controller) setLoadingMonth(false); }
  }

  function returnToToday() {
    const todayMonth = today.slice(0, 7);
    if (month !== todayMonth) void changeMonth(todayMonth);
    else { playNativeHaptic("selection"); void selectDate(today); }
  }

  function selectCalendarDate(date: string) {
    setMonth(date.slice(0, 7));
    playNativeHaptic("selection");
    void selectDate(date);
  }

  function moveCalendar(offset: number) {
    if (expanded) void changeMonth(shiftMonth(month, offset));
    else selectCalendarDate(shiftDate(selected, offset * 7));
  }

  function toggleCalendar() {
    playNativeHaptic("selection");
    setExpanded((current) => !current);
  }

  function calendarDay(date: string) {
    const daySummary = summaries[date.slice(0, 7)]?.days[date];
    const count = daySummary?.count ?? 0;
    return <button type="button" key={date} className={selected === date ? "selected" : ""} data-today={date === today} data-has-record={count > 0} data-highlighted={daySummary?.highlighted === true} data-outside-month={date.slice(0, 7) !== month} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} aria-label={`${date}${count ? english ? `, ${count} entries` : `，${count} 条记录` : english ? ", no entries" : "，没有记录"}`} onClick={() => selectCalendarDate(date)}><strong>{Number(date.slice(-2))}</strong><span className="home-calendar-indicator" aria-hidden="true">{count > 0 && <i />}</span></button>;
  }

  return <section className="today-focus home-calendar-card" aria-label={english ? "Calendar and daily timeline" : "日历与每日时间线"}>
    <div className="home-calendar-layout">
      <section className="home-calendar" aria-label={english ? "Calendar" : "日历"}>
        <header className="home-calendar-header">
          <h2>{monthLabel}</h2>
          <div className="home-calendar-actions">
            {selected !== today && <button type="button" className="home-calendar-today" onClick={returnToToday} disabled={loadingMonth}>{english ? "Today" : "今天"}</button>}
            <button type="button" className="home-calendar-previous" aria-label={expanded ? english ? "Previous month" : "上个月" : english ? "Previous week" : "上一周"} disabled={loadingMonth} onClick={() => moveCalendar(-1)}><Icon name="arrow" variant="stroke" /></button>
            <button type="button" className="home-calendar-next" aria-label={expanded ? english ? "Next month" : "下个月" : english ? "Next week" : "下一周"} disabled={loadingMonth} onClick={() => moveCalendar(1)}><Icon name="arrow" variant="stroke" /></button>
            <button type="button" className="home-calendar-toggle" aria-label={expanded ? english ? "Show week" : "收起为周" : english ? "Show month" : "展开月份"} aria-expanded={expanded} onClick={toggleCalendar}><Icon name="arrow" variant="stroke" /></button>
          </div>
        </header>
        <div className="home-calendar-grid" data-expanded={expanded} key={expanded ? month : selectedWeekStart}>
          {weekdays.map((day) => <span className="home-calendar-weekday" key={day}>{day}</span>)}
          {expanded && Array.from({ length: leading }, (_, index) => <span className="home-calendar-blank" key={`leading-${index}`} aria-hidden="true" />)}
          {(expanded ? Array.from({ length: dayCount }, (_, index) => dateFor(month, index + 1)) : visibleWeek).map(calendarDay)}
        </div>
      </section>
      <section className="home-day-timeline" aria-busy={loadingDate === selected}>
        <header className="home-day-heading"><h2>{selected === today ? english ? "Today" : "今天" : selectedLabel}</h2></header>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loadingDate === selected ? <div className="home-timeline-loading" aria-label={english ? "Loading timeline" : "正在读取时间线"}><span /><span /><span /></div> : events.length ? <div className="home-activity-list home-selected-day-events" key={selected}>{events.map((item) => { const source = sourceMeta[item.sourceType]; return <Link href={item.href} key={item.id} className="home-activity-item" data-source={item.sourceType}><time>{item.hasExplicitTime ? timeLabel(item.occurredAt) : english ? "All day" : "全天"}</time><span className="home-activity-marker" aria-hidden="true" /><span className="home-activity-copy"><span className="home-activity-source">{english ? source.en : source.zh}</span><strong className="user-content">{titleFor(item, english)}</strong>{item.detail && <small className="user-content">{item.detail}</small>}</span></Link>; })}</div> : <p className="home-today-empty">{english ? "No records on this day" : "这一天还没有记录"}</p>}
      </section>
    </div>
  </section>;
}
