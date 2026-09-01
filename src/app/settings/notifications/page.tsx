import type { Metadata } from "next";
import { listPets } from "@/lib/services/cats";
import { listCatRoutines } from "@/lib/services/cat-routine";
import { listNotificationHistory, listReminders, listScheduledNotifications } from "@/lib/services/reminder";
import { NotificationsView } from "../../notifications/notifications-view";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const [pets, upcoming, routines, reminders, history] = await Promise.all([listPets(), listScheduledNotifications(), listCatRoutines(), listReminders(), listNotificationHistory()]);
  return <NotificationsView pets={pets} initial={{ upcoming, routines, reminders: reminders.filter(item => item.sourceType !== "cat_routine"), history }}/>;
}
