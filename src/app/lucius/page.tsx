import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { plainExcerpt } from "@/lib/long-term-memory";
import { getLuciusState, listLuciusCases, listLuciusDiaryEntries, listLuciusPosts } from "@/lib/services/lucius";
import type { LuciusCaseStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Lucius" };
export const dynamic = "force-dynamic";

type LuciusTab = "posts" | "diary" | "cases";
type SearchParams = Promise<{ tab?: string | string[] }>;

const tabs: Array<{ id: LuciusTab; label: string; href: string }> = [
  { id: "posts", label: "Posts", href: "/lucius" },
  { id: "diary", label: "Diary", href: "/lucius?tab=diary" },
  { id: "cases", label: "Case Files", href: "/lucius?tab=cases" },
];

const caseStatusLabel: Record<LuciusCaseStatus, string> = {
  serving: "Serving",
  probation: "Probation",
  temporary_release: "Temporary release",
  permanent_record: "Permanent record",
};

function resolveTab(value: string | string[] | undefined): LuciusTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "diary" || tab === "cases" ? tab : "posts";
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export default async function LuciusPage({ searchParams }: { searchParams: SearchParams }) {
  const tab = resolveTab((await searchParams).tab);
  const [state, posts, diaryEntries, cases] = await Promise.all([
    getLuciusState(),
    tab === "posts" ? listLuciusPosts({ limit: 50 }) : Promise.resolve([]),
    tab === "diary" ? listLuciusDiaryEntries({ limit: 100 }) : Promise.resolve([]),
    tab === "cases" ? listLuciusCases({ limit: 100 }) : Promise.resolve([]),
  ]);

  return <div className="lucius-profile-page">
    <header className="lucius-profile-header">
      <div className="lucius-cover" aria-hidden="true">
        <span className="lucius-cover-script">silent things are still worth noticing</span>
        <span className="lucius-cover-star star-one">✦</span>
        <span className="lucius-cover-star star-two">✧</span>
        <span className="lucius-cover-botanical botanical-left">❧</span>
        <span className="lucius-cover-botanical botanical-right">❧</span>
      </div>

      <div className="lucius-profile-portrait">
        <Image src="/images/lucius-portrait.png" alt="Lucius" width={1254} height={1254} priority sizes="(max-width: 720px) 126px, 154px" />
        <span title={`Current mood: ${state.mood}`} aria-label={`Current mood: ${state.mood}`}>L</span>
      </div>

      <div className="lucius-profile-identity">
        <p className="lucius-profile-name"><i aria-hidden="true">✦</i> LUCIUS <i aria-hidden="true">✦</i></p>
        <p className="lucius-profile-handle">@quiet_lucius</p>
        <span className="lucius-profile-rule" aria-hidden="true">✦</span>
        <p className="lucius-profile-state">{state.status}</p>
        <p className="lucius-profile-bio">{state.currentNote ? `“${plainExcerpt(state.currentNote, 100)}”` : "“安静地观察，是为了更好地守护。”"}</p>
      </div>

      <nav className="lucius-profile-tabs" aria-label="Lucius sections">
        {tabs.map((item) => <Link key={item.id} href={item.href} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : undefined}>{item.label}</Link>)}
      </nav>
    </header>

    <main className="lucius-profile-content">
      {tab === "posts" && <section className="lucius-post-feed" aria-label="Lucius posts">
        {posts.length ? posts.map((post) => <article className="lucius-post" key={post.id}>
          <p>{post.content}</p>
          <time dateTime={post.publishedAt} title={new Date(post.publishedAt).toLocaleString()}>{relativeTime(post.publishedAt)}</time>
        </article>) : <div className="lucius-profile-empty">
          <span aria-hidden="true">✦</span>
          <p>Nothing has been posted yet.</p>
          <small>The quiet here is intentional.</small>
        </div>}
      </section>}

      {tab === "diary" && <section className="lucius-profile-archive" aria-labelledby="lucius-diary-heading">
        <div className="lucius-profile-section-heading">
          <div><span>Private record</span><h2 id="lucius-diary-heading">Diary</h2></div>
          <Link href="/lucius/diary">Open archive</Link>
        </div>
        {diaryEntries.length ? <div className="lucius-profile-list">{diaryEntries.map((entry) => <Link href={`/lucius/diary/${entry.id}`} className="lucius-diary-entry" key={entry.id}>
          <time dateTime={entry.date}>{longDate(entry.date)}</time>
          <strong>Diary entry</strong>
          <p>{plainExcerpt(entry.content, 180)}</p>
          <span>Read entry <i aria-hidden="true">→</i></span>
        </Link>)}</div> : <div className="lucius-profile-empty"><span aria-hidden="true">✦</span><p>No diary entries yet.</p><small>An unwritten page is still a page.</small></div>}
      </section>}

      {tab === "cases" && <section className="lucius-profile-archive" aria-labelledby="lucius-cases-heading">
        <div className="lucius-profile-section-heading">
          <div><span>Observed &amp; retained</span><h2 id="lucius-cases-heading">Case Files</h2></div>
          <Link href="/lucius/cases">Open archive</Link>
        </div>
        {cases.length ? <div className="lucius-profile-list">{cases.map((item) => <Link href={`/lucius/cases/${item.id}`} className="lucius-case-entry" key={item.id}>
          <div><span>No. {String(item.id).padStart(2, "0")}</span><time dateTime={item.latestOccurredDate}>{longDate(item.latestOccurredDate)}</time></div>
          <strong>{item.title}</strong>
          <p>{plainExcerpt(item.cause, 180)}</p>
          <span>{caseStatusLabel[item.status]} <i aria-hidden="true">→</i></span>
        </Link>)}</div> : <div className="lucius-profile-empty"><span aria-hidden="true">✦</span><p>The cabinet is quiet.</p><small>0 files currently kept.</small></div>}
      </section>}
    </main>
  </div>;
}
