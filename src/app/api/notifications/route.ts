import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listNotificationHistory, listReminders, listScheduledNotifications } from "@/lib/services/reminder";
import { listCatRoutines } from "@/lib/services/cat-routine";
import { listMealReminderRules } from "@/lib/services/meal-reminder";
import { getUiPreferences } from "@/lib/services/evaorbit";
import { buildNativeNotificationSchedules } from "@/lib/native-notifications";
import { reminderSourceDefinition } from "@/lib/reminder-source-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const now = new Date();
    const [upcoming, routines, reminders, history, mealRules, preferences] = await Promise.all([
      listScheduledNotifications(),
      listCatRoutines(),
      listReminders(),
      listNotificationHistory(),
      listMealReminderRules(),
      getUiPreferences(),
    ]);
    const nativeNotifications = buildNativeNotificationSchedules({ upcoming, locale: preferences.uiLanguage === "en" ? "en" : "zh-CN", now });
    return NextResponse.json({ upcoming, routines, reminders: reminders.filter(item => reminderSourceDefinition(item.sourceType).projectionOwner === "reminder"), history, mealRules, nativeNotifications });
  } catch (error) { return apiError(error); }
}
