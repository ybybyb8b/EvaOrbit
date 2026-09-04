"use client";

import Link from "next/link";
import { useState } from "react";
import type { TimelineEvent } from "@/lib/types";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import type { UiLanguage } from "@/lib/locale";

const PREVIEW_LIMIT = 5;

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(value));
}

export function HomeTodayBrief({ events, language }: { events: TimelineEvent[]; language: UiLanguage }) {
  const english = language === "en";
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, PREVIEW_LIMIT);

  if (!events.length) return null;

  return <>
    <div className="home-activity-list">{visible.map((item) => <Link href={item.href} key={item.id} className="home-activity-item">
      <time>{item.hasExplicitTime ? timeLabel(item.occurredAt) : english ? "All day" : "全天"}</time>
      <span className="user-content"><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span>
    </Link>)}</div>
    {events.length > PREVIEW_LIMIT && <button type="button" className="home-today-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? english ? "Show less" : "收起" : english ? `View all ${events.length} entries` : `查看今天的全部 ${events.length} 条记录`}</button>}
  </>;
}
