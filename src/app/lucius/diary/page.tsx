import type { Metadata } from "next";
import { listLuciusDiaryEntries } from "@/lib/services/lucius";
import { DiaryView } from "./diary-view";

export const metadata: Metadata = { title: "Lucius Diary" };
export const dynamic = "force-dynamic";
export default async function DiaryPage() { return <DiaryView initial={await listLuciusDiaryEntries({ limit: 100 })} />; }
