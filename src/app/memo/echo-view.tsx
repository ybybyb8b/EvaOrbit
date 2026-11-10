"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { MemoLink, useMemoData } from "@/components/memo-data-context";
import type { Memo } from "@/lib/types";
import { EchoEntries, GraphIcon } from "./echo-entries";
import { echoMemo, recentEchoEntries, type EchoEntry } from "./echo-records";
import { MemoCapture } from "./memo-capture";
import styles from "./echo.module.css";

type Overview = { memoCount: number; entityCount: number; factCount: number; pendingCount: number };

export function EchoSearch({ query = "", showRecall = false }: { query?: string; showRecall?: boolean }) {
  const { english } = useLocale();
  return <form action="/memo/recall" method="get" className={styles.search} role="search">
    {showRecall ? <Icon name="search" /> : <button className={styles.searchIcon} type="submit" aria-label={english ? "Search memories" : "搜索记忆"}><Icon name="search" /></button>}
    <input key={query} type="search" name="q" defaultValue={query} enterKeyHint="search" required={!showRecall} maxLength={20000}
      placeholder={english ? "Search your memories..." : "搜索你的记忆…"} aria-label={english ? "Search your memories" : "搜索你的记忆"} />
    {showRecall && <button className={styles.recallButton} type="submit">{english ? "Recall" : "召回"}</button>}
  </form>;
}

export function EchoWebView(props: { memos: Memo[]; facts: EchoEntry[]; overview: Overview }) {
  const router = useRouter();
  return <EchoView {...props} onSaved={() => router.refresh()} />;
}

export function EchoView({ memos, facts = [], overview, onSaved }: { memos: Memo[]; facts?: EchoEntry[]; overview?: Overview; onSaved?: () => void }) {
  const { english } = useLocale();
  const { local, complete } = useMemoData();
  const entries = recentEchoEntries(memos.map(echoMemo), facts);
  const count = new Intl.NumberFormat(english ? "en" : "zh-CN");
  const memoCount = overview?.memoCount ?? memos.length;
  const pendingCount = overview?.pendingCount ?? 0;
  const graphDescription = english ? "Explore connections" : "探索记忆间的联系";
  const pendingDescription = english ? `${count.format(pendingCount)} pending review` : `${count.format(pendingCount)} 条待审`;

  return <div className={`page ${styles.echo}`}>
    <header className={styles.masthead}>
      <div><p>An archive of what remains.</p><h1>Echo</h1></div>
      <MemoCapture knownTags={[...new Set(memos.flatMap(memo => memo.tags))].sort()} onSaved={onSaved} />
    </header>
    {!local && <EchoSearch showRecall />}
    <nav className={styles.destinations} aria-label={english ? "Memory sections" : "记忆分区"}>
      <MemoLink className={styles.destination} href="/memo/memos">
        <span className={styles.tileIcon}><Icon name="memory" variant="stroke" /></span>
        <strong>{english ? "Memos" : "碎片"}</strong>
        <span className={styles.tileDescription}>{english ? "Notes to revisit" : "回看记下的片段"}</span>
        <span className={styles.tileStats}><b>{count.format(memoCount)}{local && !complete ? "+" : ""}</b> {english ? (memoCount === 1 ? "Memo" : "Memos") : "条碎片"}</span>
      </MemoLink>
      {!local && overview && <MemoLink className={styles.destination} href="/memo/graph">
        <span className={styles.tileIcon}><GraphIcon /></span>
        <strong>Graph</strong>
        <span className={styles.tileDescription} data-pending={pendingCount > 0}>
          {pendingCount > 0 ? pendingDescription : graphDescription}
        </span>
        <span className={styles.tileStats}>
          <span><b>{count.format(overview.entityCount)}</b> {english ? overview.entityCount === 1 ? "Entity" : "Entities" : "实体"}</span>
          {" · "}
          <span><b>{count.format(overview.factCount)}</b> {english ? overview.factCount === 1 ? "Fact" : "Facts" : "事实"}</span>
        </span>
      </MemoLink>}
    </nav>
    <section className={styles.memos} aria-labelledby="echo-recent-title">
      <div className={styles.sectionHeading}><h2 id="echo-recent-title">{english ? "Recent Memories" : "最近的记忆"}</h2></div>
      {entries.length ? <EchoEntries entries={entries} /> : <p className={styles.empty}>{english ? "No memories yet." : "还没有记忆。"}</p>}
    </section>
  </div>;
}
