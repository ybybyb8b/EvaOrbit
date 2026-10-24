"use client";
import Image from "next/image";
import { LuciusSectionSwipe } from "./lucius-section-swipe";
import {WorkspaceLink as Link,useWorkspaceData} from "@/components/workspace-data-context";
import { luciusMoodPresentation } from "@/lib/lucius-mood";
import { plainExcerpt } from "@/lib/long-term-memory";
import type { LuciusCaseStatus, LuciusPostComment, LuciusState, LuciusPost, LuciusDiaryEntry, LuciusCase } from "@/lib/types";
import { LuciusPostComments } from "./lucius-post-comments";
import { PageBackButton } from "@/components/page-back-button";


export type LuciusTab = "posts" | "diary" | "cases";

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


function relativeTime(value: string,now:number) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
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

export function LuciusProfile({tab,state,posts,diaryEntries,cases,comments,now}:{now:number;tab:LuciusTab;state:LuciusState;posts:LuciusPost[];diaryEntries:LuciusDiaryEntry[];cases:LuciusCase[];comments:LuciusPostComment[]}){
  const {local}=useWorkspaceData();
  const commentsByPost = comments.reduce((groups, comment) => {
    const group = groups.get(comment.postId) ?? [];
    group.push(comment);
    groups.set(comment.postId, group);
    return groups;
  }, new Map<number, LuciusPostComment[]>());
  const mood = luciusMoodPresentation(state.mood);

  return <LuciusSectionSwipe tab={tab}>
    <header className="lucius-profile-header">
      <div className="lucius-profile-navigation">{!local&&<PageBackButton />}</div>
      <div className="lucius-cover" aria-hidden="true">
        <span className="lucius-cover-script">silent things are still worth noticing</span>
        <span className="lucius-cover-star star-one">✦</span>
        <span className="lucius-cover-star star-two">✧</span>
        <span className="lucius-cover-botanical botanical-left">❧</span>
        <span className="lucius-cover-botanical botanical-right">❧</span>
      </div>

      <div className="lucius-profile-portrait">
        <Image unoptimized={local} src="/images/lucius-profile-portrait-v2.png" alt="Lucius" width={1254} height={1254} priority sizes="(max-width: 720px) 126px, 154px" />
        <span className="lucius-profile-mood" title={`Current mood: ${mood.label}`} aria-label={`Current mood: ${mood.label}`}>{mood.emoji}</span>
      </div>

      <div className="lucius-profile-identity">
        <p className="lucius-profile-name"><i aria-hidden="true">✦</i> LUCIUS <i aria-hidden="true">✦</i></p>
        <p className="lucius-profile-handle">@quiet_lucius</p>
        <span className="lucius-profile-rule" aria-hidden="true">✦</span>
        <p className="lucius-profile-state">{state.status}</p>
      </div>

      <nav className="lucius-profile-tabs" aria-label="Lucius sections">
        {tabs.map((item) => <Link key={item.id} href={item.href} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : undefined}>{item.label}</Link>)}
      </nav>
    </header>

    <main className="lucius-profile-content">
      {tab === "posts" && <section className="lucius-post-feed" aria-label="Lucius posts">
        {posts.length ? posts.map((post) => <article className="lucius-post" key={post.id}>
          <p>{post.content}</p>
          <div className="lucius-post-meta"><time dateTime={post.publishedAt} title={new Date(post.publishedAt).toLocaleString()}>{relativeTime(post.publishedAt,now)}</time><LuciusPostComments postId={post.id} initialComments={commentsByPost.get(post.id) ?? []} /></div>
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
  </LuciusSectionSwipe>;
}
