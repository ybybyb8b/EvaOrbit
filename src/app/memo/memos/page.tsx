import type { Metadata } from "next";
import { listMemos } from "@/lib/services/memo";
import { MemoView } from "../memo-view";

export const metadata: Metadata = { title: "Memos" };
export const dynamic = "force-dynamic";

export default async function MemosPage() {
  return <MemoView initial={await listMemos({ limit: 100 })} />;
}
