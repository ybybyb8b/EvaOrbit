import type { Metadata } from "next";
import { listTrainingLogs } from "@/lib/services/training";
import { dateInEvaOrbit } from "@/lib/time";
import { TrainingHistoryView } from "./training-history-view";

export const metadata: Metadata = { title: "Training History" };
export const dynamic = "force-dynamic";

export default async function TrainingHistoryPage() {
  const month = dateInEvaOrbit().slice(0, 7);
  return <TrainingHistoryView initialMonth={month} initialLogs={await listTrainingLogs({ month, limit: 100 })} />;
}
