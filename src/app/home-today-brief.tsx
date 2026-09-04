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

const sourceMeta: Record<TimelineEvent["sourceType"], { en: string; zh: string }> = {
  food: { en: "Food", zh: "吃吃" },
  drink: { en: "Drinks", zh: "喝喝" },
  tracker: { en: "Trackers", zh: "观测" },
  cat: { en: "Cats", zh: "咪子" },
  health: { en: "Health", zh: "体征" },
  person: { en: "Relations", zh: "她们" },
  media: { en: "Media", zh: "展架" },
  chronicle: { en: "Chronicle", zh: "纪事" },
};

export function HomeTodayBrief({ events, language }: { events: TimelineEvent[]; language: UiLanguage }) {
  const english = language === "en";
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, PREVIEW_LIMIT);

  if (!events.length) return <p className="home-today-empty">{english ? "No records today" : "今天还没有记录"}</p>;

  return <>
    <div className="home-activity-list">{visible.map((item) => {
      const source = sourceMeta[item.sourceType];
      return <Link href={item.href} key={item.id} className="home-activity-item" data-source={item.sourceType}>
        <time>{item.hasExplicitTime ? timeLabel(item.occurredAt) : english ? "All day" : "全天"}</time>
        <span className="home-activity-marker" aria-hidden="true" />
        <span className="home-activity-copy">
          <span className="home-activity-source">{english ? source.en : source.zh}</span>
          <strong className="user-content">{item.title}</strong>
          {item.detail && <small className="user-content">{item.detail}</small>}
        </span>
      </Link>;
    })}</div>
    {events.length > PREVIEW_LIMIT && <button type="button" className="home-today-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? english ? "Show less" : "收起" : english ? `View all ${events.length} entries` : `查看今天的全部 ${events.length} 条记录`}</button>}
  </>;
}
