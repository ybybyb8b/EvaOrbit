import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksView } from "./tasks-view";

export const metadata: Metadata = { title: "任务" };

export default function TasksPage() { return <Suspense fallback={<div className="loading-state">正在载入任务…</div>}><TasksView /></Suspense>; }
