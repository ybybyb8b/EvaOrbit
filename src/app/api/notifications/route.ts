import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listNotificationHistory, listReminders, listScheduledNotifications } from "@/lib/services/reminder";
import { listCatRoutines } from "@/lib/services/cat-routine";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [upcoming, routines, reminders, history] = await Promise.all([
      listScheduledNotifications(),
      listCatRoutines(),
      listReminders(),
      listNotificationHistory(),
    ]);
    return NextResponse.json({ upcoming, routines, reminders: reminders.filter(item => item.sourceType !== "cat_routine"), history });
  } catch (error) { return apiError(error); }
}
