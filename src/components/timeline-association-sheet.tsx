"use client";

import type { ComponentType, ReactNode } from "react";
import { FormSheet } from "./form-sheet";
import { zonedDateParts } from "@/lib/time";
import type { TimelineAssociation } from "@/lib/timeline-association";

export function TimelineAssociationSheet({ association, english, LinkComponent: Link, onClose, onCalendar }: { association: TimelineAssociation; english: boolean; LinkComponent: ComponentType<{ href: string; className?: string; children?: ReactNode }>; onClose: () => void; onCalendar: () => void }) {
  const { calendar, tracker, entry } = association;
  const time = (value: string) => { const parts = zonedDateParts(value); return `${parts.date} ${parts.time}`; };
  return <FormSheet title={english ? "Associated records" : "关联记录"} onClose={onClose}>
    <div className="home-time-detail">
      <p className="home-time-context">{english ? "Automatically associated by a Timeline rule. Original times, records and statistics are preserved." : "由 Timeline 规则自动关联，原始时间、记录和业务统计均保留。"}</p>
      <section><h3>Calendar · {calendar.title}</h3><p>{time(calendar.startAt)} → {time(calendar.endAt)}</p>{calendar.location && <p className="user-content">{calendar.location}</p>}{calendar.notes && <p className="user-content home-sleep-notes">{calendar.notes}</p>}<button type="button" className="button secondary" onClick={onCalendar}>{english ? "View original Calendar event" : "查看原始日历事项"}</button><p className="home-time-context">{english ? "Edit this synced event in Apple Calendar or its original calendar app." : "请在 Apple Calendar 或原日历应用中编辑同步事项。"}</p></section>
      <section><h3 className="user-content">Tracker · {tracker.name}</h3><p>{time(entry.occurredAt)}{entry.endAt ? ` → ${time(entry.endAt)}` : ""}</p>{entry.note && <p className="user-content home-sleep-notes">{entry.note}</p>}<Link className="button secondary" href={`/trackers/${tracker.id}?entry=${entry.id}`}>{english ? "View / edit original Tracker record" : "查看／编辑原始 Tracker 记录"}</Link></section>
      <Link className="section-link" href="/settings/timeline-association">{english ? "Manage association rules" : "管理关联规则"}</Link>
    </div>
  </FormSheet>;
}
