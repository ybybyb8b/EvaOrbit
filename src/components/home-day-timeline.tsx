"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowRight2 } from "reicon-react";
import { FormSheet } from "./form-sheet";
import { dateRange } from "@/lib/time";
import type { FoodLog, TimelineEvent } from "@/lib/types";
import styles from "@/app/home-calendar-timeline.module.css";

const minute = 60_000;
const hour = 60 * minute;
const pixelsPerHour = 88;
const labelSpacing = 44;

type Mark = { item: TimelineEvent; start: number; end: number; lane: number };
export type TimelineEntryView = "untimed" | "axis" | "details";

function dayMarks(events: TimelineEvent[], date: string) {
  const range = dateRange(date);
  const from = Date.parse(range.from), to = Date.parse(range.to);
  const allDay: TimelineEvent[] = [], dateOnly: TimelineEvent[] = [], marks: Mark[] = [];

  for (const item of events) {
    if (item.sourceType === "calendar" && item.metadata.isAllDay === true) {
      allDay.push(item);
      continue;
    }
    const meal = item.metadata.calendarMeal as FoodLog["calendarMeal"];
    const start = Date.parse(meal?.startAt ?? item.occurredAt);
    const end = Date.parse(meal?.endAt ?? item.endAt ?? "");
    if (!(item.hasExplicitTime || meal) || !Number.isFinite(start)) {
      dateOnly.push(item);
    } else if (end > start && start < to && end > from) {
      marks.push({ item, start: Math.max(start, from), end: Math.min(end, to), lane: 0 });
    } else if (start >= from && start < to) {
      const displayedMinute = from + Math.floor((start - from) / minute) * minute;
      marks.push({ item, start: displayedMinute, end: displayedMinute, lane: -1 });
    } else {
      dateOnly.push(item);
    }
  }

  marks.sort((a, b) => a.start - b.start || b.end - a.end || a.item.id.localeCompare(b.item.id));
  const laneEnds: number[] = [];
  for (const mark of marks) {
    if (mark.lane === -1) continue;
    const available = laneEnds.findIndex(end => end <= mark.start);
    mark.lane = available === -1 ? laneEnds.length : available;
    laneEnds[mark.lane] = mark.end;
  }

  const first = marks[0]?.start ?? from;
  const start = first - 15 * minute;
  const last = Math.max(first, ...marks.map(mark => mark.end));
  const end = Math.min(to, last + 20 * minute);
  const gaps: Array<{ start: number; end: number }> = [];
  let occupiedUntil = first;
  for (const mark of marks) {
    if (mark.start - occupiedUntil > hour) gaps.push({ start: occupiedUntil, end: mark.start });
    occupiedUntil = Math.max(occupiedUntil, mark.end);
  }
  const position = (time: number) => (time - start) / hour * pixelsPerHour - gaps.reduce((removed, gap) => {
    const fraction = Math.max(0, Math.min(1, (time - gap.start) / (gap.end - gap.start)));
    return removed + fraction * ((gap.end - gap.start) / hour * pixelsPerHour - 62);
  }, 0);
  const labels: Mark[][] = [];
  for (const mark of marks) {
    const current = labels.at(-1);
    // Keep nearby labels readable while leaving their marks at the original times.
    if (current && position(mark.start) - position(current[0].start) < labelSpacing) current.push(mark);
    else labels.push([mark]);
  }
  const intervals = marks.filter(mark => mark.lane >= 0).sort((a, b) => a.lane % 2 - b.lane % 2 || a.lane - b.lane);
  const boundaries = [...new Set(intervals.flatMap(mark => [mark.start, mark.end]))].sort((a, b) => a - b);
  const segments = boundaries.slice(0, -1).map((start, index) => ({
    start,
    end: boundaries[index + 1],
    intervals: intervals.filter(mark => mark.start <= start && mark.end > start).sort((a, b) => (b.end - b.start) - (a.end - a.start)),
  })).filter(segment => segment.intervals.length);

  return { allDay, dateOnly, labels, segments, gaps, end, position };
}

export function HomeDayTimeline({ date, events, english, timeLabel, titleFor, renderEntry }: {
  date: string;
  events: TimelineEvent[];
  english: boolean;
  timeLabel: (value: string) => string;
  titleFor: (item: TimelineEvent) => string;
  renderEntry: (item: TimelineEvent, view: TimelineEntryView, onOpen?: () => void) => ReactNode;
}) {
  const [group, setGroup] = useState<Mark[] | null>(null);
  const [showUntimed, setShowUntimed] = useState(false);
  const untimedId = useId();
  const { allDay, dateOnly, labels, segments, gaps, end, position } = dayMarks(events, date);
  const untimed = [...allDay, ...dateOnly];
  const labelAt = (time: number) => timeLabel(new Date(time).toISOString());
  const groupTime = (items: Mark[]) => {
    const times = [...new Set(items.map(item => labelAt(item.start)))];
    return times.length > 2 ? `${times.slice(0, 2).join(" / ")} / …` : times.join(" / ");
  };
  const groupCount = (count: number) => english ? `${count} events` : `${count} 条记录`;
  const height = position(end);
  const lastLabel = labels.at(-1)?.[0];
  const untimedRow = (item: TimelineEvent) => <li key={item.id}>
    <span className={styles.untimedKind}>{allDay.includes(item) ? english ? "All day" : "全天" : english ? "Date only" : "仅日期"}</span>
    {renderEntry(item, "untimed")}
  </li>;

  return <div className="home-selected-day-events">
    {untimed.length > 0 && <div className={styles.untimed}>
      <ul className={styles.untimedList}>{untimed.slice(0, 3).map(untimedRow)}</ul>
      {untimed.length > 3 && <>
        <ul id={untimedId} className={styles.untimedList} hidden={!showUntimed}>{untimed.slice(3).map(untimedRow)}</ul>
        <button type="button" className={`section-link ${styles.untimedToggle}`} aria-controls={untimedId} aria-expanded={showUntimed} onClick={() => setShowUntimed(!showUntimed)}>
          {showUntimed ? english ? "Show fewer" : "收起" : english ? `Show ${untimed.length - 3} more` : `再显示 ${untimed.length - 3} 条`}
        </button>
      </>}
    </div>}
    {lastLabel && <div className={styles.timePlot} style={{ minHeight: Math.max(height + 10, position(lastLabel.start) + 42) }}>
      <div className={styles.timeRuler} style={{ height }} aria-hidden="true" />
      {gaps.map(gap => <span key={gap.start} className={styles.timeGap} style={{ top: (position(gap.start) + position(gap.end)) / 2 }}>
        {english ? `${Math.round((gap.end - gap.start) / minute)}m gap` : `间隔 ${Math.round((gap.end - gap.start) / minute)} 分钟`}
      </span>)}
      {segments.map(segment => <div key={segment.start} className={styles.timeSegment} style={{ top: position(segment.start), height: position(segment.end) - position(segment.start), borderRadius: `${segment.intervals.every(mark => mark.start === segment.start) ? 2 : 0}px ${segment.intervals.every(mark => mark.start === segment.start) ? 2 : 0}px ${segment.intervals.every(mark => mark.end === segment.end) ? 2 : 0}px ${segment.intervals.every(mark => mark.end === segment.end) ? 2 : 0}px` }} aria-hidden="true">
        {segment.intervals.map(({ item }, index) => <span key={item.id} data-interval={item.id} data-source={item.sourceType} data-overlap={index > 0 || undefined} className={styles.timeInterval} />)}
      </div>)}
      {labels.map((items, index) => {
        const first = items[0];
        const second = items[1];
        const next = labels[index + 1]?.[0];
        const sameLaneSide = first.lane >= 0 && second?.lane >= 0 && first.lane % 2 === second.lane % 2;
        const showBoth = items.length === 2 && !sameLaneSide && (!next || position(next.start) - position(second.start) >= labelSpacing || second.start === first.start);
        const firstLane = first.lane >= 0 ? first.lane : showBoth && second.lane >= 0 ? second.lane + 1 : index;
        const firstSide = firstLane % 2 ? "right" : "left";
        const secondSide = firstSide === "left" ? "right" : "left";
        const points = new Map<number, string>();
        for (const { start, lane, item } of items) {
          if (lane === -1) points.set(start, points.has(start) ? "mixed" : item.sourceType);
        }
        return <div key={first.item.id} className={styles.timeLabel} style={{ top: position(first.start) }}>
          {[...points].map(([time, source]) => <span key={time} className={styles.timeDot} style={{ top: position(time) - position(first.start) }} data-source={source} aria-hidden="true" />)}
          <div className={styles.timeCard} data-side={firstSide} data-source={first.item.sourceType} data-duration={first.lane >= 0 || undefined}>{renderEntry(first.item, "axis")}</div>
          {second && <div className={styles.timeCard} style={{ top: showBoth ? position(second.start) - position(first.start) : 0 }} data-side={secondSide} data-source={second.item.sourceType} data-duration={showBoth && second.lane >= 0 || undefined}>
            {showBoth ? renderEntry(second.item, "axis") : <button type="button" className={`${styles.timelineEntry} ${styles.timeGroup}`} aria-haspopup="dialog" onClick={() => setGroup(items)}>
              <span className={styles.entryCopy}><strong className="user-content">{titleFor(second.item)}{items.length > 2 && ` +${items.length - 2}`}</strong><small>{groupTime(items)} · {groupCount(items.length)}</small></span>
              <ArrowRight2 size={13} aria-hidden="true" />
            </button>}
          </div>}
        </div>;
      })}
    </div>}
    {group && <FormSheet title={`${groupTime(group)} · ${groupCount(group.length)}`} onClose={() => setGroup(null)}>
      <ul className={styles.groupList}>{group.map(({ item }) => <li key={item.id}>{renderEntry(item, "details", () => setGroup(null))}</li>)}</ul>
    </FormSheet>}
  </div>;
}
