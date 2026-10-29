import { getUiPreferences } from "@/lib/services/evaorbit";
import { getTimelineMonthSummary } from "@/lib/services/timeline";
import { getHomeDayOverview } from "@/lib/services/home-day";
import { getDueReminders } from "@/lib/services/reminder";

import { DueReminders } from "@/components/due-reminders";
import { HomeCalendarTimeline } from "./home-calendar-timeline";
import { HomePageView } from "@/components/home-page-view";
import { getHomeCacheScope } from "@/lib/services/home-cache-scope";
import { catchUpAutomaticSubscriptionPayments } from "@/lib/services/subscription";
import { reconcilePeriodMedicationReminders } from "@/lib/services/period-medication-reminder";
import { dateInEvaOrbit } from "@/lib/time";

export const dynamic = "force-dynamic";

async function loadHomeData() {
  const now = new Date();
  const date = dateInEvaOrbit(now);
  // Share renewal preparation; reminder calibration must not delay the timeline.
  const renewalsReady = catchUpAutomaticSubscriptionPayments(now);
  return Promise.all([
    renewalsReady.then(() => getHomeDayOverview(date, { readOnly: true })),
    renewalsReady.then(() => getTimelineMonthSummary(date.slice(0, 7), { readOnly: true })),
    renewalsReady.then(async () => {
      await reconcilePeriodMedicationReminders(now);
      return getDueReminders(50, now, { readOnly: true });
    }),
  ]);
}

export default async function HomePage() {
  const [preferences, [today, monthSummary, due], cacheScope] = await Promise.all([getUiPreferences(), loadHomeData(), getHomeCacheScope()]);
  return <HomePageView language={preferences.uiLanguage} due={<DueReminders items={due} compact/>}><HomeCalendarTimeline key={cacheScope} cacheScope={cacheScope} dueItems={due} initialDay={today} initialSummary={monthSummary} language={preferences.uiLanguage}/></HomePageView>;
}
