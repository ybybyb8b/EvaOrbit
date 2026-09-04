import Link from "next/link";
import { getUiPreferences } from "@/lib/services/evaorbit";
import { listInbox } from "@/lib/services/inbox";
import { getDailyTimelineOverview } from "@/lib/services/timeline";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { HomeDestinations } from "./home-destinations";
import { HomeTodayBrief } from "./home-today-brief";
import { DueReminders } from "@/components/due-reminders";
import { getDueReminders } from "@/lib/services/reminder";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

function dateLabel() {
  const parts = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", weekday: "long", timeZone: EVAORBIT_TIME_ZONE }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}年${value("month")}月${value("day")}日 ${value("weekday")}`;
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date()));
  if (hour < 6) return "还没睡吗";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 19) return "下午好";
  return "晚上好";
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(value));
}

export default async function HomePage() {
  const [inbox, today, preferences, due] = await Promise.all([listInbox("inbox"), getDailyTimelineOverview(), getUiPreferences(), getDueReminders(3)]);
  const latestInbox = inbox[0];

  return <div className="page home-page">
    <header className="home-masthead">
      <span className={styles.date}>{dateLabel()}</span>
      <h1>{greeting()}</h1>
    </header>

    <DueReminders items={due} limit={3} compact />

    <section className={`home-overview ${styles.overview}`}>
      <div className={`home-today-grid home-now-grid ${styles.nowGrid}`}>
        <section className="today-focus home-activity" data-empty={today.events.length === 0}>
          <div className="section-heading compact"><span className="eyebrow">今天</span><p>{today.events.length} 条记录</p></div>
          <HomeTodayBrief events={today.events} />
        </section>

        <section className="home-kept home-inbox-card">
          <div className="home-inbox-heading">
            <div><span className="eyebrow">待整理</span><div><h2>Inbox</h2><span className="home-inbox-count">{inbox.length}</span></div></div>
            <Link className="section-link" href="/inbox">打开 Inbox →</Link>
          </div>
          {latestInbox && <Link className="home-inbox-preview" href="/inbox"><strong>{latestInbox.content}</strong><time dateTime={latestInbox.createdAt}>{timeLabel(latestInbox.createdAt)}</time></Link>}
        </section>
      </div>
    </section>

    <HomeDestinations initialOrder={preferences.homeModuleOrder} />
  </div>;
}
