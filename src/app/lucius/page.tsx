import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { plainExcerpt } from "@/lib/long-term-memory";
import { getLuciusState, listLuciusCases, listLuciusDiaryEntries } from "@/lib/services/lucius";
import type { LuciusCaseStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Lucius" };
export const dynamic = "force-dynamic";

function updatedLabel(value: string | null) {
  if (!value) return null;
  return `updated ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))}`;
}

const caseStatusLabel: Record<LuciusCaseStatus, string> = {
  serving: "Serving", probation: "Probation", temporary_release: "Temporary release", permanent_record: "Permanent record",
};

export default async function LuciusPage() {
  const [diaryEntries, cases, state] = await Promise.all([
    listLuciusDiaryEntries({ limit: 1 }),
    listLuciusCases({ limit: 200 }),
    getLuciusState(),
  ]);
  const latestDiary = diaryEntries[0] ?? null;
  const latestCase = cases[0] ?? null;
  const stateUpdatedLabel = updatedLabel(state.updatedAt);

  return <div className="lucius-room">
    <header className="lucius-portrait-section">
      <span className="lucius-kicker">LUCIUS</span>
      <div className="lucius-portrait-wrap">
        <span className="lucius-portrait-ornament botanical" aria-hidden="true">❧</span>
        <span className="lucius-portrait-ornament star" aria-hidden="true">✦</span>
        <div className="lucius-portrait-frame"><Image src="/images/lucius-portrait.png" alt="Lucius" width={1254} height={1254} priority sizes="(max-width: 720px) 176px, 222px" /></div>
      </div>
      <div className="lucius-state-line"><span>{state.status}</span>{stateUpdatedLabel && <><i aria-hidden="true">·</i><time>{stateUpdatedLabel}</time></>}<b title="Current mood" aria-label={`Current mood: ${state.mood}`}>❦</b></div>
    </header>

    <main className="lucius-desk" aria-label="Lucius's desk">
      <span className="lucius-desk-edge" aria-hidden="true" />
      <div className="lucius-desk-grid">
        <Link href="/lucius/diary" className="lucius-diary-book">
          <span className="surface-label">DIARY</span>
          {latestDiary ? <><time dateTime={latestDiary.date}>{latestDiary.date}</time><p>{plainExcerpt(latestDiary.content, 210)}</p></> : <><time>AN EMPTY PAGE</time><p className="lucius-empty-copy">Nothing has been written here yet.</p></>}
          <span className="lucius-surface-action">Open the diary <Icon name="arrow" /></span>
        </Link>

        <Link href="/lucius/cases" className="lucius-case-folder">
          <span className="lucius-folder-tab">CASE FILES</span>
          <strong>{cases.length}<small> files kept</small></strong>
          {latestCase ? <div><span>LATEST · {caseStatusLabel[latestCase.status]}</span><h2>{latestCase.title}</h2><time dateTime={latestCase.latestOccurredDate}>{latestCase.latestOccurredDate}</time></div> : <div><span>THE CABINET IS QUIET</span><h2>No case files yet.</h2></div>}
          <span className="lucius-surface-action">Open the files <Icon name="arrow" /></span>
        </Link>

        <section className="lucius-note-paper" aria-labelledby="lucius-note-title">
          <span className="lucius-note-pin" aria-hidden="true" />
          <small id="lucius-note-title">A NOTE FROM LUCIUS</small>
          <blockquote>{state.currentNote || "No note has been left here."}</blockquote>
        </section>

        <section className="lucius-state-token" aria-labelledby="lucius-current-state">
          <span className="lucius-medallion" aria-hidden="true">✦</span>
          <div><small id="lucius-current-state">CURRENT STATE</small><strong>{state.mood}</strong><span>{state.status}</span></div>
        </section>

        <section className="lucius-nameplate" aria-label="About Lucius">
          <span><small>ABOUT</small><strong>Lucius</strong></span>
          <p>A private place for what he keeps, remembers, and corrects.</p>
          <i aria-hidden="true">→</i>
        </section>
      </div>
    </main>
  </div>;
}
