import "server-only";

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { supabaseConfig } from "../config";
import { dateInEvaOrbit } from "../time";
import { isMealReminderType, MEAL_REMINDER_TARGET_IDS, mealReminderWindow } from "../meal-reminders";
import { nextTrackerNotification, notificationDeliverySlot, notificationShouldSend, trackerReminderShouldNotify } from "../reminder-engine";
import { reminderNotificationCopy } from "../notification-copy";
import type { TrackerReminder } from "../types";
import { weightReminderWindow } from "../weight";
import type { EvaPushPayload } from "./types";
import { activePeriodMedicationPeriod, PERIOD_MEDICATION_REMINDER_SOURCE, PERIOD_MEDICATION_REMINDER_TIMEZONE, periodMedicationReminderProjection } from "../period-medication-reminder";
import type { MedicationDoseEvent, MedicationPreset, MenstrualPeriod } from "../types";
import { reminderSourceAllows, reminderSourceDefinition } from "../reminder-source-registry";

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

function periodFromRow(row: Row): MenstrualPeriod {
  return { id: Number(row.id), startedOn: String(row.started_on), endedOn: row.ended_on ? String(row.ended_on) : null, notes: "", createdAt: "", updatedAt: "" };
}

function presetFromRow(row: Row): MedicationPreset {
  return { id: Number(row.id), name: String(row.name), defaultDoseText: "", minReminderIntervalMinutes: Number(row.min_reminder_interval_minutes), reminderEnabled: Boolean(row.reminder_enabled), periodLinkEnabled: Boolean(row.period_link_enabled), notes: "", archivedAt: row.archived_at ? String(row.archived_at) : null, createdAt: "", updatedAt: "" };
}

function doseFromRow(row: Row): MedicationDoseEvent {
  return { id: Number(row.id), medicationPresetId: Number(row.medication_preset_id), periodId: row.period_id === null ? null : Number(row.period_id), takenAt: String(row.taken_at), medicationNameSnapshot: "", doseText: "", notes: "", createdAt: "", updatedAt: "" };
}

async function reconcilePeriodMedicationPushProjections(client: DeliveryClient, now: Date) {
  const [presetResult, periodResult, reminderResult] = await Promise.all([
    client.from("medication_presets").select("id,user_id,name,min_reminder_interval_minutes,reminder_enabled,period_link_enabled,archived_at"),
    client.from("menstrual_periods").select("id,user_id,started_on,ended_on"),
    client.from("reminders").select("*").eq("source_type", PERIOD_MEDICATION_REMINDER_SOURCE),
  ]);
  if (presetResult.error || periodResult.error || reminderResult.error) throw new Error("Could not reconcile period medication reminders");
  const presets = (presetResult.data ?? []) as Row[], periods = (periodResult.data ?? []) as Row[], existing = (reminderResult.data ?? []) as Row[];
  const activePeriods = new Map<string, MenstrualPeriod>();
  for (const userId of new Set(periods.map((row) => String(row.user_id)))) {
    const active = activePeriodMedicationPeriod(periods.filter((row) => String(row.user_id) === userId).map(periodFromRow), now);
    if (active) activePeriods.set(userId, active);
  }
  const activePeriodIds = [...new Set(activePeriods.values().map((period) => period.id))];
  const doseResult = activePeriodIds.length
    ? await client.from("medication_dose_events").select("id,user_id,medication_preset_id,period_id,taken_at").in("period_id", activePeriodIds)
    : { data: [], error: null };
  if (doseResult.error) throw new Error("Could not read period medication doses");
  const doses = (doseResult.data ?? []) as Row[];
  const existingByKey = new Map(existing.map((row) => [`${String(row.user_id)}:${Number(row.source_id)}`, row]));
  const validKeys = new Set<string>();
  for (const row of presets) {
    const userId = String(row.user_id), preset = presetFromRow(row), period = activePeriods.get(userId) ?? null;
    const projection = periodMedicationReminderProjection(preset, period, doses.filter((dose) => String(dose.user_id) === userId).map(doseFromRow), now);
    const key = `${userId}:${preset.id}`, reminder = existingByKey.get(key);
    if (!projection) {
      if (reminder && (Boolean(reminder.is_active) || String(reminder.status) !== "cancelled")) await client.from("reminders").update({ is_active: false, status: "cancelled", next_due_at: null, snoozed_until: null, cancelled_at: now.toISOString() }).eq("id", reminder.id);
      continue;
    }
    validKeys.add(key);
    if (!reminder) {
      const inserted = await client.from("reminders").insert({ user_id: userId, title: projection.title, target_type: "health", target_id: null, source_type: PERIOD_MEDICATION_REMINDER_SOURCE, source_id: preset.id, schedule_type: "one_time", starts_at: projection.startsAt, next_due_at: projection.nextDueAt, due_has_explicit_time: true, interval_value: null, interval_unit: null, times_of_day: [], ends_at: projection.endsAt, timezone: PERIOD_MEDICATION_REMINDER_TIMEZONE, note: "", lead_time_minutes: 0, repeat_while_overdue: false, status: "scheduled", is_active: true });
      if (inserted.error && inserted.error.code !== "23505") throw new Error("Could not create period medication reminder projection");
      continue;
    }
    const acknowledged = String(reminder.starts_at) === projection.startsAt && String(reminder.status) === "completed";
    const scheduleChanged = !acknowledged && (String(reminder.starts_at) !== projection.startsAt || String(reminder.next_due_at ?? "") !== projection.nextDueAt);
    const patch: Row = { title: projection.title, target_type: "health", target_id: null, starts_at: projection.startsAt, next_due_at: acknowledged ? null : projection.nextDueAt, ends_at: projection.endsAt, due_has_explicit_time: true, repeat_while_overdue: false };
    if (scheduleChanged) Object.assign(patch, { is_active: true, status: "scheduled", snoozed_until: null, last_notified_at: null, sent_at: null, cancelled_at: null, last_completed_at: null });
    else if (!acknowledged && !Boolean(reminder.is_active)) Object.assign(patch, { is_active: true, status: "scheduled", cancelled_at: null });
    if (reminder.snoozed_until && String(reminder.snoozed_until) >= projection.endsAt) patch.snoozed_until = null;
    const updated = await client.from("reminders").update(patch).eq("id", reminder.id);
    if (updated.error) throw new Error("Could not update period medication reminder projection");
  }
  for (const reminder of existing) {
    const key = `${String(reminder.user_id)}:${Number(reminder.source_id)}`;
    if (!validKeys.has(key) && (Boolean(reminder.is_active) || String(reminder.status) !== "cancelled")) await client.from("reminders").update({ is_active: false, status: "cancelled", next_due_at: null, snoozed_until: null, cancelled_at: now.toISOString() }).eq("id", reminder.id);
  }
  return validKeys;
}

async function deliverReminderPushes(client: DeliveryClient, now: Date, validPeriodMedicationKeys: Set<string>) {
  const { data, error } = await client.from("reminders").select("*").eq("is_active", true).in("status", ["scheduled", "failed", "sent"]);
  if (error) throw new Error("Could not read due reminders");
  const due = (data as Row[]).filter((row) => reminderSourceAllows(row.source_type ? String(row.source_type) : null, "web_push") && (String(row.source_type ?? "") !== PERIOD_MEDICATION_REMINDER_SOURCE || validPeriodMedicationKeys.has(`${String(row.user_id)}:${Number(row.source_id)}`)) && notificationShouldSend({
    nextDueAt: row.next_due_at ? String(row.next_due_at) : null,
    snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
    dueHasExplicitTime: row.due_has_explicit_time === undefined ? true : Boolean(row.due_has_explicit_time),
    leadTimeMinutes: Number(row.lead_time_minutes ?? 0),
    lastNotifiedAt: row.last_notified_at ? String(row.last_notified_at) : null,
    timezone: String(row.timezone ?? "Asia/Shanghai"),
    repeatWhileOverdue: Boolean(row.repeat_while_overdue),
  }, now));
  const preferencesResult = due.length
    ? await client.from("ui_preferences").select("user_id,ui_language").in("user_id", [...new Set(due.map((row) => String(row.user_id)))])
    : { data: [] };
  const languages = new Map(((preferencesResult.data ?? []) as Row[]).map((row) => [String(row.user_id), String(row.ui_language)]));
  let sent = 0;
  for (const reminder of due) {
    const deliveryScheduledAt = notificationDeliverySlot({
      nextDueAt: reminder.next_due_at ? String(reminder.next_due_at) : null,
      snoozedUntil: reminder.snoozed_until ? String(reminder.snoozed_until) : null,
      dueHasExplicitTime: reminder.due_has_explicit_time === undefined ? true : Boolean(reminder.due_has_explicit_time),
      leadTimeMinutes: Number(reminder.lead_time_minutes ?? 0),
      timezone: String(reminder.timezone ?? "Asia/Shanghai"),
      repeatWhileOverdue: Boolean(reminder.repeat_while_overdue),
    }, now);
    if (!deliveryScheduledAt) continue;
    let trackerRule: TrackerReminder | null = null;
    let trackerDeliveryId: number | null = null;
    if (reminderSourceDefinition(reminder.source_type ? String(reminder.source_type) : null).projectionOwner === "tracker" && reminder.source_id) {
      const ruleResult = await client.from("tracker_reminders").select("*").eq("id",Number(reminder.source_id)).eq("enabled",true).maybeSingle();
      if (ruleResult.error) throw new Error("Could not read Tracker reminder rule");
      if (!ruleResult.data) continue;
      const row=ruleResult.data as Row;
      trackerRule={id:Number(row.id),trackerId:Number(row.tracker_id),reminderMode:String(row.notification_mode) as TrackerReminder["reminderMode"],configuredTime:String(row.configured_time).slice(0,5),periodDays:Number(row.period_days),anchorDate:String(row.anchor_date),nextDueAt:String(row.next_due_at),timezone:String(row.timezone),reminderId:row.reminder_id===null?null:Number(row.reminder_id),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};
      const entriesResult=await client.from("tracker_entries").select("occurred_at").eq("user_id",String(reminder.user_id)).eq("tracker_id",trackerRule.trackerId);
      if(entriesResult.error)throw new Error("Could not check Tracker entries");
      const entries=((entriesResult.data??[]) as Row[]).map(entry=>({occurredAt:String(entry.occurred_at)}));
      if(!trackerReminderShouldNotify(trackerRule,entries,now)){
        const nextDueAt=nextTrackerNotification(trackerRule,entries,now);
        await client.from("tracker_reminders").update({next_due_at:nextDueAt}).eq("id",trackerRule.id);
        await client.from("reminders").update({next_due_at:nextDueAt,status:"scheduled",last_notified_at:null,sent_at:null}).eq("id",reminder.id);
        continue;
      }
      const existing=await client.from("notification_deliveries").select("id,status").eq("user_id",String(reminder.user_id)).eq("source_type",String(reminder.source_type)).eq("source_id",trackerRule.id).eq("scheduled_at",String(reminder.next_due_at)).maybeSingle();
      if(existing.error)throw new Error("Could not check Tracker notification history");
      if(existing.data?.status==="sent"){
        const nextDueAt=nextTrackerNotification({...trackerRule,nextDueAt:String(reminder.next_due_at)},entries,now);
        await client.from("tracker_reminders").update({next_due_at:nextDueAt}).eq("id",trackerRule.id);
        await client.from("reminders").update({next_due_at:nextDueAt,status:"scheduled",last_notified_at:null,sent_at:null}).eq("id",reminder.id);
        continue;
      }
      trackerDeliveryId=existing.data?.id?Number(existing.data.id):null;
      if(trackerDeliveryId===null){
        const reservation=await client.from("notification_deliveries").insert({user_id:reminder.user_id,reminder_id:reminder.id,title:reminder.title,source_type:reminder.source_type,source_id:trackerRule.id,target_type:reminder.target_type,target_id:reminder.target_id,scheduled_at:reminder.next_due_at,scheduled_has_explicit_time:true,sent_at:null,status:"failed"}).select("id").single();
        if(reservation.error){if(reservation.error.code==="23505")continue;throw new Error("Could not reserve Tracker notification");}
        trackerDeliveryId=Number(reservation.data.id);
      }
    }
    let deliveryId = trackerDeliveryId;
    if (deliveryId === null) {
      const dedupeKey = `reminder:${reminder.id}:${deliveryScheduledAt}`;
      const existing = await client.from("notification_deliveries").select("id,status").eq("user_id",String(reminder.user_id)).eq("dedupe_key",dedupeKey).maybeSingle();
      if (existing.error) throw new Error("Could not check reminder notification history");
      if (existing.data?.status === "sent") continue;
      deliveryId = existing.data?.id ? Number(existing.data.id) : null;
      if (deliveryId === null) {
        const reservation = await client.from("notification_deliveries").insert({user_id:reminder.user_id,reminder_id:reminder.id,title:reminder.title,source_type:reminder.source_type,source_id:reminder.source_id,target_type:reminder.target_type,target_id:reminder.target_id,scheduled_at:deliveryScheduledAt,scheduled_has_explicit_time:true,sent_at:null,status:"failed",dedupe_key:dedupeKey}).select("id").single();
        if (reservation.error) { if (reservation.error.code === "23505") continue; throw new Error("Could not reserve reminder notification"); }
        deliveryId = Number(reservation.data.id);
      }
    }
    const copy = reminderNotificationCopy({
      title: String(reminder.title),
      sourceType: reminder.source_type ? String(reminder.source_type) : null,
      intervalValue: reminder.interval_value === null ? null : Number(reminder.interval_value),
      nextDueAt: reminder.next_due_at ? String(reminder.next_due_at) : null,
      timezone: reminder.timezone ? String(reminder.timezone) : null,
    }, languages.get(String(reminder.user_id)) === "en" ? "en-US" : "zh-CN", "web_push");
    const delivery = await sendToUser(client, String(reminder.user_id), {
      kind: "reminder_due",
      title: copy.title,
      body: copy.body,
      url: "/notifications",
      tag: `reminder-${reminder.id}-${deliveryScheduledAt.slice(0,10)}`,
    });
    sent += delivery.sent;
    const status = delivery.delivered ? "sent" : "failed";
    const deliveryRow={
      user_id: reminder.user_id,
      reminder_id: reminder.id,
      title: reminder.title,
      source_type: reminder.source_type,
      source_id: reminder.source_id,
      target_type: reminder.target_type,
      target_id: reminder.target_id,
      scheduled_at: deliveryScheduledAt,
      scheduled_has_explicit_time: reminder.due_has_explicit_time === undefined ? true : Boolean(reminder.due_has_explicit_time),
      sent_at: delivery.delivered ? now.toISOString() : null,
      status,
    };
    await client.from("notification_deliveries").update({sent_at:deliveryRow.sent_at,status}).eq("id",deliveryId);
    if(trackerRule&&delivery.delivered){
      const entries: Array<{occurredAt:string}>=[];
      const nextDueAt=nextTrackerNotification({...trackerRule,nextDueAt:String(reminder.next_due_at)},entries,now);
      await client.from("tracker_reminders").update({next_due_at:nextDueAt}).eq("id",trackerRule.id);
      await client.from("reminders").update({next_due_at:nextDueAt,status:"scheduled",last_notified_at:now.toISOString(),sent_at:now.toISOString()}).eq("id",reminder.id);
    }else await client.from("reminders").update({
      status,
      last_notified_at: delivery.delivered ? now.toISOString() : reminder.last_notified_at,
      sent_at: delivery.delivered ? now.toISOString() : reminder.sent_at,
    }).eq("id", reminder.id);
  }
  return { due: due.length, sent };
}

async function deliverMissingMealPushes(client: DeliveryClient, now: Date) {
  if (!reminderSourceAllows("meal_missing", "web_push")) return { due: 0, sent: 0 };
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
    const copy = reminderNotificationCopy({ title: english ? meal.en : meal.zh, sourceType: "meal_missing" }, english ? "en-US" : "zh-CN", "web_push");
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
      title: copy.title,
      body: copy.body,
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

async function deliverMissingWeightPushes(client:DeliveryClient,now:Date){
  if(!reminderSourceAllows("weight_missing","web_push"))return{due:0,sent:0};
  const{data,error}=await client.from("weight_settings").select("user_id,reminder_enabled,reminder_time").eq("reminder_enabled",true);if(error)throw new Error("Could not read weight reminder settings");const date=dateInEvaOrbit(now);let due=0,sent=0;
  for(const row of (data??[]) as Row[]){const userId=String(row.user_id);const window=weightReminderWindow({targetWeightKg:null,reminderEnabled:true,reminderTime:String(row.reminder_time).slice(0,5),updatedAt:""},date,now);if(!window)continue;const existing=await client.from("notification_deliveries").select("id,status").eq("user_id",userId).eq("source_type","weight_missing").eq("scheduled_at",window.scheduledAt).maybeSingle();if(existing.error)throw new Error("Could not check weight notification history");if(existing.data?.status==="sent")continue;const logged=await client.from("weight_records").select("id").eq("user_id",userId).gte("occurred_at",window.from).lt("occurred_at",window.to).limit(1);if(logged.error)throw new Error("Could not check weight records");if(logged.data?.length)continue;due+=1;
    const preference=await client.from("ui_preferences").select("ui_language").eq("user_id",userId).maybeSingle();const english=preference.data?.ui_language==="en",title=english?"Log today’s weight":"记录今天的体重";let deliveryId=existing.data?.id?Number(existing.data.id):null;if(deliveryId===null){const reservation=await client.from("notification_deliveries").insert({user_id:userId,reminder_id:null,title,source_type:"weight_missing",source_id:1,target_type:"health",target_id:1,scheduled_at:window.scheduledAt,scheduled_has_explicit_time:true,sent_at:null,status:"failed"}).select("id").single();if(reservation.error){if(reservation.error.code==="23505")continue;throw new Error("Could not reserve weight notification");}deliveryId=Number(reservation.data.id);}
    const copy=reminderNotificationCopy({title:english?"weight":"体重",sourceType:"weight_missing"},english?"en-US":"zh-CN","web_push");const delivery=await sendToUser(client,userId,{kind:"weight_missing",title:copy.title,body:copy.body,url:"/health",tag:`weight-${date}`});sent+=delivery.sent;await client.from("notification_deliveries").update({title,status:delivery.delivered?"sent":"failed",sent_at:delivery.delivered?now.toISOString():null}).eq("id",deliveryId);
  }return{due,sent};
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
  const validPeriodMedicationKeys = await reconcilePeriodMedicationPushProjections(client, now);
  const [reminders, meals, weights] = await Promise.all([deliverReminderPushes(client, now, validPeriodMedicationKeys), deliverMissingMealPushes(client, now), deliverMissingWeightPushes(client,now)]);
  return { due: reminders.due, sent: reminders.sent, mealDue: meals.due, mealSent: meals.sent, weightDue:weights.due, weightSent:weights.sent };
}
