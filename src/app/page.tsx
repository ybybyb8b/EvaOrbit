import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { getUiPreferences } from "@/lib/services/evaorbit";
import { listInbox } from "@/lib/services/inbox";
import { getDailyTimelineOverview } from "@/lib/services/timeline";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { HomeDestinations } from "./home-destinations";

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

function timelineIcon(sourceType: string): IconName {
  if (sourceType === "food") return "food";
  if (sourceType === "drink") return "drink";
  if (sourceType === "tracker") return "tracker";
  if (sourceType === "cat") return "cats";
  if (sourceType === "person") return "people";
  if (sourceType === "media") return "media";
  return "chronicle";
}

export default async function HomePage() {
  const [inbox, today, preferences] = await Promise.all([listInbox("inbox"), getDailyTimelineOverview(), getUiPreferences()]);
  const recentInbox = inbox.slice(0, 4);
  const todayActivity = today.events.slice(0, 6);
  const sourceCounts = today.events.reduce<Record<string, number>>((counts, event) => ({ ...counts, [event.sourceType]: (counts[event.sourceType] ?? 0) + 1 }), {});
  const sourceLabels: Record<string, string> = { food: "Food", drink: "Drinks", tracker: "Trackers", cat: "Cats", person: "People", media: "Media", chronicle: "Chronicle" };

  return <div className="page home-page">
    <header className="home-masthead">
      <span className="eyebrow">{dateLabel()}</span>
      <h1>{greeting()}</h1>
      <p>Your life, gathered quietly in one place.</p>
    </header>

    <section className="home-overview">
      <div className="section-heading"><div><span className="eyebrow">TODAY OVERVIEW</span><h2>A living summary</h2></div><p>{today.events.length} events · {Object.keys(sourceCounts).length} spaces</p></div>
      <div className="home-source-summary">{Object.entries(sourceCounts).map(([source, count]) => <span key={source}><Icon name={timelineIcon(source)} /><strong>{sourceLabels[source] ?? source}</strong><small>{count}</small></span>)}{!today.events.length && <p>Nothing recorded yet. A quiet day still counts.</p>}</div>
      <div className="home-today-grid home-now-grid">
        <section className="today-focus home-activity">
        <div className="section-heading compact"><div><span className="eyebrow">TIMELINE</span><h3>What happened</h3></div></div>
        {todayActivity.length ? <div className="home-activity-list">{todayActivity.map((item) => <Link href={item.href} key={item.id} className="home-activity-item">
          <span className="home-activity-icon"><Icon name={timelineIcon(item.sourceType)} /></span>
          <span><strong>{item.title}</strong><small>{item.detail}</small></span>
          <time>{timeLabel(item.occurredAt)}</time>
        </Link>)}</div> : <EmptyState text="No events yet today." href="/trackers" action="Record something" />}
      </section>

      <section className="home-kept home-inbox-card">
        <div className="section-heading compact"><div><span className="eyebrow">INBOX</span><h3>Still unsorted</h3></div><span>{inbox.length}</span></div>
        {recentInbox.length ? <div className="home-inbox-list">{recentInbox.map((item) => <Link href="/inbox" key={item.id}><strong>{item.content}</strong><small>{timeLabel(item.createdAt)} · Inbox</small></Link>)}</div> : <EmptyState text="Inbox is clear." href="/inbox?new=1" action="Capture a thought" />}
      </section>
      </div>
    </section>

    <HomeDestinations initialOrder={preferences.homeModuleOrder} />
  </div>;
}

function EmptyState({ text, href, action }: { text: string; href: string; action: string }) {
  return <div className="empty-compact"><p>{text}</p><Link href={href}>{action} →</Link></div>;
}
