import type { Metadata } from "next";
import { getCalendarInterpretationOverview } from "@/lib/services/calendar-interpretation";
import { CalendarInterpretationView } from "./view";

export const metadata: Metadata = { title: "Calendar interpretation" };
export default async function CalendarInterpretationPage() {
  const overview = await getCalendarInterpretationOverview();
  return <CalendarInterpretationView initialSettings={overview.settings} records={overview.records} />;
}
export const dynamic = "force-dynamic";
