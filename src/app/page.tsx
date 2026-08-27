import Link from "next/link";
import { getUiPreferences } from "@/lib/services/evaorbit";
import { listInbox } from "@/lib/services/inbox";
import { getDailyTimelineOverview } from "@/lib/services/timeline";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { HomeDestinations } from "./home-destinations";
import { HomeTodayBrief } from "./home-today-brief";

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
  const [inbox, today, preferences] = await Promise.all([listInbox("inbox"), getDailyTimelineOverview(), getUiPreferences()]);
  const recentInbox = inbox.slice(0, 4);

  return <div className="page home-page">
    <header className="home-masthead">
      <span className="eyebrow">{dateLabel()}</span>
      <h1>{greeting()}</h1>
    </header>

    <section className="home-overview">
      <div className="home-today-grid home-now-grid">
        <section className="today-focus home-activity">
          <div className="section-heading compact"><div><span className="eyebrow">TODAY</span><h2>Today</h2></div><p>{today.events.length} {today.events.length === 1 ? "record" : "records"}</p></div>
          <HomeTodayBrief events={today.events} />
        </section>

        <section className={`home-kept home-inbox-card ${recentInbox.length ? "" : "is-empty"}`}>
          {recentInbox.length ? <><div className="section-heading compact"><div><span className="eyebrow">INBOX</span><h2>Inbox</h2></div><p>{inbox.length}</p></div><div className="home-inbox-list">{recentInbox.map((item) => <Link href="/inbox" key={item.id}><strong>{item.content}</strong><small>{timeLabel(item.createdAt)}</small></Link>)}</div></> : <Link className="home-inbox-empty" href="/inbox?new=1"><span>Inbox · 0</span><strong>Capture →</strong></Link>}
        </section>
      </div>
    </section>

    <HomeDestinations initialOrder={preferences.homeModuleOrder} />
  </div>;
}
