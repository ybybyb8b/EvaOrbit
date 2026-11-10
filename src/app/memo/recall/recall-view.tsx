"use client";

import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import type { MemoryContext } from "@/lib/memory-context";
import { EchoEntries } from "../echo-entries";
import type { EchoEntry } from "../echo-records";
import { EchoSearch } from "../echo-view";
import styles from "../echo.module.css";

export function RecallView({ query, entries, status }: { query: string; entries: EchoEntry[]; status?: MemoryContext["coverage"]["status"] | "invalid" }) {
  const { english } = useLocale();
  const failed = status === "failed" || status === "timeout" || status === "invalid";
  return <div className={`page ${styles.echo}`}>
    <header className={styles.masthead}><h1 className={styles.innerTitle}>{english ? "Recall" : "召回"}</h1></header>
    <EchoSearch query={query} />
    <section className={styles.memos} aria-label={english ? "Recall results" : "召回结果"}>
      {failed && <ErrorNotice role="alert">{status === "invalid"
        ? english ? "Try a shorter search." : "请缩短搜索内容。"
        : english ? "Recall could not finish. Try searching again." : "召回未完成，请重新搜索。"}</ErrorNotice>}
      {status === "partial" && <p className={styles.recallNote}>{english ? "Showing part of the results." : "仅展示部分结果。"}</p>}
      {entries.length > 0 ? <EchoEntries entries={entries} /> : !failed && <p className={styles.empty}>{query
        ? english ? "No matching memories." : "没有找到匹配的记忆。"
        : english ? "Search for a person, topic, or something you remember." : "输入人物、主题或你记得的片段。"}</p>}
    </section>
  </div>;
}
