import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ChevronRight } from "reicon-react";
import { PageHeader } from "@/components/page-header";
import { BackupExportCard } from "./backup-export-card";

export const metadata: Metadata = { title: "Data & Backup" };

export default function DataBackupPage() {
  return <div className="page settings-detail-page data-backup-page"><PageHeader eyebrow="数据与备份" title="Data & Backup" description="查看当前存储方式与已有数据入口。" action={<Link className="settings-back-link" href="/settings">全部设置</Link>} />
    <div className="settings-summary"><section><span>Production data</span><strong>Supabase Postgres</strong></section><section><span>Access</span><strong>Private account · RLS</strong></section><section><span>Local development</span><strong>Independent SQLite</strong></section></div>
    <BackupExportCard />
    <section className="legacy-data-settings"><div><span className="eyebrow">PRESERVED DATA</span><h2>旧数据还在</h2><p>旧 Memory 已从日常导航撤下，但页面、记录和历史链接仍然保留。这里是它的稳定入口。</p></div><nav aria-label="旧数据入口"><Link href="/memory"><span><Archive size={15} weight="Outline" />旧 Memory</span><ChevronRight size={15} weight="Outline" /></Link></nav></section>
  </div>;
}
