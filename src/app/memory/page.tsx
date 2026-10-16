import { PageLoading } from "@/components/page-loading";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MemoryView } from "./memory-view";

export const metadata: Metadata = { title: "记忆" };

export default function MemoryPage() { return <Suspense fallback={<PageLoading title="记忆" englishTitle="Memory" />}><MemoryView /></Suspense>; }
