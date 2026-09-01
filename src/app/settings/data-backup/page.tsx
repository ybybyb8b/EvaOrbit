import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Data & Backup" };

export default function DataBackupPage() {
  return <div className="page settings-detail-page"><PageHeader eyebrow="DATA & BACKUP" title="Data & Backup" description="The storage that already exists, without promising a backup tool that is not here yet." action={<Link className="settings-back-link" href="/settings">All settings</Link>} />
    <div className="settings-summary"><section><span>Production data</span><strong>Supabase Postgres</strong></section><section><span>Access</span><strong>Private account · RLS</strong></section><section><span>Local fallback</span><strong>SQLite schema v8</strong></section></div>
    <section className="legacy-data-settings"><div><span className="eyebrow">PRESERVED DATA</span><h2>旧数据还在</h2><p>Task 和 Memory 已从日常导航撤下，但页面、记录和历史链接仍然保留。这里是它们稳定的入口。</p></div><nav aria-label="旧数据入口"><Link href="/tasks"><span><Icon name="tasks" />旧待办</span><Icon name="arrow" /></Link><Link href="/memory"><span><Icon name="memory" />旧 Memory</span><Icon name="arrow" /></Link></nav></section>
  </div>;
}
