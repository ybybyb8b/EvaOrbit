import { DaysView } from "./days-view";
import { listImportantDates } from "@/lib/services/important-dates";
export const dynamic = "force-dynamic";
export default async function DaysPage() { return <DaysView initial={await listImportantDates()} />; }
