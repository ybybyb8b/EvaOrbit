import type { Metadata } from "next";
import { TrackerDetailView } from "./tracker-detail-view";

export const metadata: Metadata = { title: "Tracker" };
type Props = { params: Promise<{ id: string }> };
export default async function TrackerDetailPage({ params }: Props) { return <TrackerDetailView trackerId={Number((await params).id)} />; }
