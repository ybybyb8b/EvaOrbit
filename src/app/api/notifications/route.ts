import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listNotificationHistory, listReminders, listScheduledNotifications } from "@/lib/services/reminder";
import { listCatRoutines } from "@/lib/services/cat-routine";
import { listMealReminderRules } from "@/lib/services/meal-reminder";
import { listFoodLogs } from "@/lib/services/food";
import { getUiPreferences } from "@/lib/services/evaorbit";
import { buildNativeNotificationSchedules } from "@/lib/native-notifications";
import { dateInEvaOrbit, dateRange, shiftDate } from "@/lib/time";
import { getWeightSettings, listWeightRecords } from "@/lib/services/weight";

export const runtime = "nodejs";

export async function GET() {
  try {
    const now = new Date();
    const firstDate = dateInEvaOrbit(now);
    const [upcoming, routines, reminders, history, mealRules, foodLogs, preferences, weightSettings, weightRecords] = await Promise.all([
      listScheduledNotifications(),
      listCatRoutines(),
      listReminders(),
      listNotificationHistory(),
      listMealReminderRules(),
      listFoodLogs({ from: dateRange(firstDate).from, to: dateRange(shiftDate(firstDate, 7)).from }),
      getUiPreferences(),
      getWeightSettings(),
      listWeightRecords({ from: dateRange(firstDate).from, to: dateRange(shiftDate(firstDate,7)).from, limit:100 }),
    ]);
    const nativeNotifications = buildNativeNotificationSchedules({ upcoming, mealRules, foodLogs, weightSettings, weightRecords, locale: preferences.uiLanguage === "en" ? "en" : "zh-CN", now });
    return NextResponse.json({ upcoming, routines, reminders: reminders.filter(item => item.sourceType !== "cat_routine" && !item.sourceType?.startsWith("tracker_")), history, mealRules, nativeNotifications });
  } catch (error) { return apiError(error); }
}
