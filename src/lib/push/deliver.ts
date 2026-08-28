import "server-only";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { supabaseConfig } from "../config";
import { notificationShouldSend } from "../reminder-engine";

type Row=Record<string,unknown>;
export async function deliverDueReminderPushes(now=new Date()){
 const secret=process.env.SUPABASE_SECRET_KEY?.trim(),privateKey=process.env.EVAORBIT_VAPID_PRIVATE_KEY?.trim(),publicKey=process.env.EVAORBIT_VAPID_PUBLIC_KEY?.trim(),subject=process.env.EVAORBIT_VAPID_SUBJECT?.trim();if(!secret||!privateKey||!publicKey||!subject)throw new Error("Push delivery is not configured");
 const{url}=supabaseConfig();const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});webpush.setVapidDetails(subject,publicKey,privateKey);
 const{data,error}=await client.from("reminders").select("*").eq("is_active",true).in("status",["scheduled","failed"]);if(error)throw new Error("Could not read due reminders");const due=(data as Row[]).filter(row=>notificationShouldSend({nextDueAt:row.next_due_at?String(row.next_due_at):null,snoozedUntil:row.snoozed_until?String(row.snoozed_until):null,leadTimeMinutes:Number(row.lead_time_minutes??0),lastNotifiedAt:row.last_notified_at?String(row.last_notified_at):null},now));let sent=0;
 for(const reminder of due){const{subscriptions,error:subscriptionError}=await (async()=>{const result=await client.from("push_subscriptions").select("*").eq("user_id",reminder.user_id);return{subscriptions:result.data as Row[]|null,error:result.error};})();if(subscriptionError)continue;let delivered=false;for(const subscription of subscriptions??[]){try{await webpush.sendNotification({endpoint:String(subscription.endpoint),keys:{p256dh:String(subscription.p256dh),auth:String(subscription.auth)}},JSON.stringify({kind:"reminder_due",title:String(reminder.title),body:"时间到了 搞快处理喔！",url:"/notifications",tag:`reminder-${reminder.id}`}));delivered=true;sent++;}catch(error){const status=(error as{statusCode?:number}).statusCode;if(status===404||status===410)await client.from("push_subscriptions").delete().eq("id",subscription.id);}}
  const status=delivered?"sent":"failed";if(delivered||reminder.status!=="failed")await client.from("notification_deliveries").insert({user_id:reminder.user_id,reminder_id:reminder.id,title:reminder.title,source_type:reminder.source_type,source_id:reminder.source_id,target_type:reminder.target_type,target_id:reminder.target_id,scheduled_at:reminder.next_due_at,sent_at:delivered?now.toISOString():null,status});
  await client.from("reminders").update({status,last_notified_at:delivered?now.toISOString():reminder.last_notified_at,sent_at:delivered?now.toISOString():reminder.sent_at}).eq("id",reminder.id);
 }
 return{due:due.length,sent};
}
