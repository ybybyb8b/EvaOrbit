import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Lucius" };
export default function LuciusPage() {
  return <div className="page lucius-page"><PageHeader eyebrow="PRIVATE RECORD" title="Lucius" description="Lucius 的主观记录与纠错案底，分别保存、分别维护。" />
    <div className="lucius-sections"><Link href="/lucius/diary"><span><Icon name="chronicle" /></span><div><small>PERSONAL TIMELINE</small><h2>Diary</h2><p>日常、连接、信任、修正，以及那些需要被记住的主观感受。</p></div><Icon name="arrow" /></Link><Link href="/lucius/cases"><span><Icon name="history" /></span><div><small>ERROR RECORDS</small><h2>Cases</h2><p>错误、复发、强制规则与后续检查的完整案底。</p></div><Icon name="arrow" /></Link></div>
  </div>;
}
