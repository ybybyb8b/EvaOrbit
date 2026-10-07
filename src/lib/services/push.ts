import "server-only";
import webpush from "web-push";
import type { EvaOrbitRepository } from "../repositories/types";
import type { EvaPushPayload } from "../push/types";
import { getRepository } from "../repositories";
import { ValidationError } from "../validation";
export function pushPublicConfig(){const publicKey=process.env.EVAORBIT_VAPID_PUBLIC_KEY?.trim()??"";return{enabled:Boolean(publicKey&&process.env.EVAORBIT_VAPID_PRIVATE_KEY),publicKey};}
export async function listPushSubscriptions(){return(await getRepository()).listPushSubscriptions();}
export async function savePushSubscription(value:unknown){if(!value||typeof value!=="object")throw new ValidationError("Subscription is invalid");const body=value as Record<string,unknown>;const keys=body.keys as Record<string,unknown>|undefined;if(typeof body.endpoint!=="string"||!body.endpoint.startsWith("https://")||typeof keys?.p256dh!=="string"||typeof keys.auth!=="string")throw new ValidationError("Subscription is invalid");return(await getRepository()).upsertPushSubscription({endpoint:body.endpoint,p256dh:keys.p256dh,auth:keys.auth});}
export async function removePushSubscription(endpoint:unknown){if(typeof endpoint!=="string"||!endpoint.startsWith("https://"))throw new ValidationError("Subscription is invalid");return(await getRepository()).deletePushSubscription(endpoint);}

export async function notifyLuciusActivity(repository: EvaOrbitRepository, payload: EvaPushPayload = { kind: "lucius_activity", title: "Lucius有新动态", body: "要来看看吗？", url: "/lucius", tag: "lucius-activity" }) {
  const publicKey = process.env.EVAORBIT_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.EVAORBIT_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.EVAORBIT_VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const subscriptions = await repository.listPushSubscriptions();
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { timeout: 10_000 });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await repository.deletePushSubscription(subscription.endpoint);
        else console.error("Lucius notification delivery failed", status ?? "network error");
      }
    }));
  } catch {
    // The update is already saved; a notification failure must not invite a duplicate write.
    console.error("Lucius notification delivery failed");
  }
}
