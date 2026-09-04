import "server-only";

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { supabaseConfig } from "../config";
import { dateInEvaOrbit } from "../time";
import { isMealReminderType, MEAL_REMINDER_TARGET_IDS, mealReminderWindow } from "../meal-reminders";
import { notificationShouldSend } from "../reminder-engine";
import type { EvaPushPayload } from "./types";

type Row = Record<string, unknown>;
function createDeliveryClient(url: string, secret: string) {
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
type DeliveryClient = ReturnType<typeof createDeliveryClient>;

async function sendToUser(client: DeliveryClient, userId: string, payload: EvaPushPayload) {
  const result = await client.from("push_subscriptions").select("*").eq("user_id", userId);
  if (result.error) return { delivered: false, sent: 0 };
  let delivered = false;
  let sent = 0;
  for (const subscription of (result.data ?? []) as Row[]) {
    try {
      await webpush.sendNotification({
        endpoint: String(subscription.endpoint),
        keys: { p256dh: String(subscription.p256dh), auth: String(subscription.auth) },
      }, JSON.stringify(payload));
      delivered = true;
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await client.from("push_subscriptions").delete().eq("id", Number(subscription.id));
    }
  }
  return { delivered, sent };
}

async function deliverReminderPushes(client: DeliveryClient, now: Date) {
  const { data, error } = await client.from("reminders").select("*").eq("is_active", true).in("status", ["scheduled", "failed"]);
  if (error) throw new Error("Could not read due reminders");
  const due = (data as Row[]).filter((row) => notificationShouldSend({
    nextDueAt: row.next_due_at ? String(row.next_due_at) : null,
    snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
    dueHasExplicitTime: row.due_has_explicit_time === undefined ? true : Boolean(row.due_has_explicit_time),
    leadTimeMinutes: Number(row.lead_time_minutes ?? 0),
    lastNotifiedAt: row.last_notified_at ? String(row.last_notified_at) : null,
  }, now));
  let sent = 0;
  for (const reminder of due) {
    const delivery = await sendToUser(client, String(reminder.user_id), {
      kind: "reminder_due",
      title: String(reminder.title),
      body: "时间到了 搞快处理喔！",
      url: "/notifications",
      tag: `reminder-${reminder.id}`,
    });
    sent += delivery.sent;
    const status = delivery.delivered ? "sent" : "failed";
    if (delivery.delivered || reminder.status !== "failed") await client.from("notification_deliveries").insert({
      user_id: reminder.user_id,
      reminder_id: reminder.id,
      title: reminder.title,
      source_type: reminder.source_type,
      source_id: reminder.source_id,
      target_type: reminder.target_type,
      target_id: reminder.target_id,
      scheduled_at: reminder.next_due_at,
      scheduled_has_explicit_time: reminder.due_has_explicit_time === undefined ? true : Boolean(reminder.due_has_explicit_time),
      sent_at: delivery.delivered ? now.toISOString() : null,
      status,
    });
    await client.from("reminders").update({
      status,
      last_notified_at: delivery.delivered ? now.toISOString() : reminder.last_notified_at,
      sent_at: delivery.delivered ? now.toISOString() : reminder.sent_at,
    }).eq("id", reminder.id);
  }
  return { due: due.length, sent };
}

async function deliverMissingMealPushes(client: DeliveryClient, now: Date) {
  const { data, error } = await client.from("meal_reminder_rules").select("user_id,meal_type,remind_at,enabled").eq("enabled", true);
  if (error) throw new Error("Could not read meal reminder rules");
  const date = dateInEvaOrbit(now);
  const candidates = (data as Row[]).flatMap((row) => {
    const mealType = row.meal_type;
    if (!isMealReminderType(mealType)) return [];
    const window = mealReminderWindow({ remindAt: String(row.remind_at).slice(0, 5), enabled: true }, date, now);
    return window ? [{ userId: String(row.user_id), mealType, ...window }] : [];
  });
  if (!candidates.length) return { due: 0, sent: 0 };

  const userIds = [...new Set(candidates.map((item) => item.userId))];
  const preferencesResult = await client.from("ui_preferences").select("user_id,ui_language").in("user_id", userIds);
  const languages = new Map(((preferencesResult.data ?? []) as Row[]).map((row) => [String(row.user_id), String(row.ui_language)]));
  const labels = {
    breakfast: { zh: "早餐", en: "breakfast" },
    lunch: { zh: "午餐", en: "lunch" },
    dinner: { zh: "晚餐", en: "dinner" },
  } as const;
  let due = 0;
  let sent = 0;

  for (const candidate of candidates) {
    const targetId = MEAL_REMINDER_TARGET_IDS[candidate.mealType];
    const existingResult = await client.from("notification_deliveries")
      .select("id,status")
      .eq("user_id", candidate.userId)
      .eq("source_type", "meal_missing")
      .eq("target_type", "food")
      .eq("target_id", targetId)
      .eq("scheduled_at", candidate.scheduledAt)
      .maybeSingle();
    if (existingResult.error) throw new Error("Could not check meal notification history");
    if (existingResult.data?.status === "sent") continue;

    const mealResult = await client.from("food_logs")
      .select("id")
      .eq("user_id", candidate.userId)
      .eq("meal_type", candidate.mealType)
      .gte("occurred_at", candidate.from)
      .lt("occurred_at", candidate.to)
      .limit(1);
    if (mealResult.error) throw new Error("Could not check meal records");
    if (mealResult.data?.length) continue;
    due += 1;

    const english = languages.get(candidate.userId) === "en";
    const meal = labels[candidate.mealType];
    const title = english ? `No ${meal.en} logged` : `还没记录${meal.zh}`;
    let deliveryId = existingResult.data?.id ? Number(existingResult.data.id) : null;
    if (deliveryId === null) {
      const reservation = await client.from("notification_deliveries").insert({
        user_id: candidate.userId,
        reminder_id: null,
        title,
        source_type: "meal_missing",
        source_id: targetId,
        target_type: "food",
        target_id: targetId,
        scheduled_at: candidate.scheduledAt,
        scheduled_has_explicit_time: true,
        sent_at: null,
        status: "failed",
      }).select("id").single();
      if (reservation.error) {
        if (reservation.error.code === "23505") continue;
        throw new Error("Could not reserve meal notification");
      }
      deliveryId = Number(reservation.data.id);
    }

    const delivery = await sendToUser(client, candidate.userId, {
      kind: "meal_missing",
      title,
      body: english ? `Today's ${meal.en} has not been recorded.` : `今天的${meal.zh}还没有记录。`,
      url: "/food",
      tag: `meal-${candidate.mealType}-${date}`,
    });
    sent += delivery.sent;
    await client.from("notification_deliveries").update({
      title,
      status: delivery.delivered ? "sent" : "failed",
      sent_at: delivery.delivered ? now.toISOString() : null,
    }).eq("id", deliveryId);
  }
  return { due, sent };
}

export async function deliverDueReminderPushes(now = new Date()) {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const privateKey = process.env.EVAORBIT_VAPID_PRIVATE_KEY?.trim();
  const publicKey = process.env.EVAORBIT_VAPID_PUBLIC_KEY?.trim();
  const subject = process.env.EVAORBIT_VAPID_SUBJECT?.trim();
  if (!secret || !privateKey || !publicKey || !subject) throw new Error("Push delivery is not configured");
  const { url } = supabaseConfig();
  const client = createDeliveryClient(url, secret);
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const [reminders, meals] = await Promise.all([deliverReminderPushes(client, now), deliverMissingMealPushes(client, now)]);
  return { due: reminders.due, sent: reminders.sent, mealDue: meals.due, mealSent: meals.sent };
}
