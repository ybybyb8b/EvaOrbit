import Link from "next/link";
import { getUiPreferences } from "@/lib/services/evaorbit";
import { listInbox } from "@/lib/services/inbox";
import { getDailyTimelineOverview } from "@/lib/services/timeline";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { HomeDestinations } from "./home-destinations";
import { HomeTodayBrief } from "./home-today-brief";
import { DueReminders } from "@/components/due-reminders";
import { getDueReminders } from "@/lib/services/reminder";

export const dynamic = "force-dynamic";

function dateLabel() {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: EVAORBIT_TIME_ZONE }).format(new Date());
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date()));
  if (hour < 6) return "Still awake?";
  if (hour < 11) return "Good morning";
  if (hour < 14) return "Good afternoon";
  if (hour < 19) return "Good afternoon";
  return "Good evening";
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date(value));
}

export default async function HomePage() {
  const [inbox, today, preferences, due] = await Promise.all([listInbox("inbox"), getDailyTimelineOverview(), getUiPreferences(), getDueReminders(3)]);
  const latestInbox = inbox[0];

  return <div className="page home-page">
    <header className="home-masthead">
      <span className="eyebrow">{dateLabel()}</span>
      <h1>{greeting()}</h1>
    </header>

    <DueReminders items={due} limit={3} compact />

    <section className="home-overview">
      <div className="home-today-grid home-now-grid">
        <section className="today-focus home-activity">
          <div className="section-heading compact"><span className="eyebrow">TODAY</span><p>{today.events.length} {today.events.length === 1 ? "record" : "records"}</p></div>
          <HomeTodayBrief events={today.events} />
        </section>

        <section className="home-kept home-inbox-card">
          <div className="home-inbox-heading">
            <div><span className="eyebrow">INBOX</span><div><h2>Inbox</h2><span className="home-inbox-count">{inbox.length}</span></div></div>
            <Link className="section-link" href="/inbox">View inbox →</Link>
          </div>
          {latestInbox ? <Link className="home-inbox-preview" href="/inbox"><strong>{latestInbox.content}</strong><time dateTime={latestInbox.createdAt}>{timeLabel(latestInbox.createdAt)}</time></Link> : <p className="home-inbox-empty">Nothing waiting to be sorted.</p>}
        </section>
      </div>
    </section>

    <HomeDestinations initialOrder={preferences.homeModuleOrder} />
  </div>;
}
