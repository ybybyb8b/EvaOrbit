import type { HomeDayOverview } from "./home-day.ts";
import type { TimelineMonthSummary } from "./types.ts";

export async function fetchHomeData(date: string, months: string[], signal: AbortSignal) {
  async function read<T>(url: string): Promise<T> {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Could not refresh Home data");
    return response.json();
  }
  const [day, summaries] = await Promise.all([
    read<HomeDayOverview>(`/api/home-day?date=${encodeURIComponent(date)}`),
    Promise.all([...new Set(months)].map(month => read<TimelineMonthSummary>(`/api/timeline?month=${encodeURIComponent(month)}`))),
  ]);
  return { day, summaries };
}
