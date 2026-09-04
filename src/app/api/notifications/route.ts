import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listNotificationHistory, listReminders, listScheduledNotifications } from "@/lib/services/reminder";
import { listCatRoutines } from "@/lib/services/cat-routine";
import { listMealReminderRules } from "@/lib/services/meal-reminder";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [upcoming, routines, reminders, history, mealRules] = await Promise.all([
      listScheduledNotifications(),
      listCatRoutines(),
      listReminders(),
      listNotificationHistory(),
      listMealReminderRules(),
    ]);
    return NextResponse.json({ upcoming, routines, reminders: reminders.filter(item => item.sourceType !== "cat_routine"), history, mealRules });
  } catch (error) { return apiError(error); }
}
