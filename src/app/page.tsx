import { getUiPreferences } from "@/lib/services/evaorbit";
import { getTimelineMonthSummary } from "@/lib/services/timeline";
import { getHomeDayOverview } from "@/lib/services/home-day";
import { getDueReminders } from "@/lib/services/reminder";

import { DueReminders } from "@/components/due-reminders";
import { HomeCalendarTimeline } from "./home-calendar-timeline";
import { HomePageView } from "@/components/home-page-view";
import { getHomeCacheScope } from "@/lib/services/home-cache-scope";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [preferences, today, monthSummary, due, cacheScope] = await Promise.all([getUiPreferences(), getHomeDayOverview(), getTimelineMonthSummary(), getDueReminders(), getHomeCacheScope()]);
  return <HomePageView language={preferences.uiLanguage} due={<DueReminders items={due} compact/>}><HomeCalendarTimeline key={cacheScope} cacheScope={cacheScope} initialDay={today} initialSummary={monthSummary} language={preferences.uiLanguage}/></HomePageView>;
}
