import Link from "next/link";
import type { HomeBrief as HomeBriefData, HomeBriefItem, HomeBriefPeriod } from "@/lib/home-brief";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import styles from "./home.module.css";

function BriefItem({ item }: { item: HomeBriefItem }) {
  const content = <>{item.value && <strong>{item.value}</strong>}<span>{item.text}</span></>;
  return <li>{item.href ? <Link href={item.href}>{content}</Link> : <div>{content}</div>}</li>;
}

function BriefColumn({ period, items, english }: { period: HomeBriefPeriod; items: HomeBriefItem[]; english: boolean }) {
  const title = period === "yesterday" ? english ? "Yesterday" : "昨天" : english ? "Today" : "今天";
  const empty = period === "yesterday" ? english ? "Not much was recorded yesterday" : "昨天没有太多记录" : english ? "Today is quiet for now" : "今天暂时很安静";
  return <div className={styles.briefColumn}>
    <h2>{title}</h2>
    {items.length ? <ul>{items.map((item, index) => <BriefItem item={item} key={`${item.type}:${item.text}:${index}`} />)}</ul> : <p>{empty}</p>}
  </div>;
}

export function HomeBrief({ brief, english }: { brief: HomeBriefData; english: boolean }) {
  const yesterday = brief.items.filter((item) => item.period === "yesterday");
  const today = brief.items.filter((item) => item.period === "today");
  const updated = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(brief.updatedAt));
  return <section className={styles.brief} aria-labelledby="home-brief-title">
    <header className={styles.briefHeader}>
      <span id="home-brief-title" className={styles.briefLabel}>BRIEF</span>
      <time dateTime={brief.updatedAt}>{english ? "Updated" : "更新于"} {updated}</time>
    </header>
    <div className={styles.briefGrid}>
      <BriefColumn period="yesterday" items={yesterday} english={english} />
      <BriefColumn period="today" items={today} english={english} />
    </div>
  </section>;
}
