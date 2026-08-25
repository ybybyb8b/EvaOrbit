import type { Metadata } from "next";
import { Suspense } from "react";
import { MemoryView } from "./memory-view";

export const metadata: Metadata = { title: "记忆" };

export default function MemoryPage() { return <Suspense fallback={<div className="loading-state">正在载入记忆…</div>}><MemoryView /></Suspense>; }
