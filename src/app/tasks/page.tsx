import { PageLoading } from "@/components/page-loading";
import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksView } from "./tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() { return <Suspense fallback={<PageLoading title="任务" englishTitle="Tasks" />}><TasksView /></Suspense>; }
