import "server-only";
import { getRepository } from "../repositories";
import { ValidationError } from "../validation";
export function pushPublicConfig(){const publicKey=process.env.EVAORBIT_VAPID_PUBLIC_KEY?.trim()??"";return{enabled:Boolean(publicKey&&process.env.EVAORBIT_VAPID_PRIVATE_KEY),publicKey};}
export async function listPushSubscriptions(){return(await getRepository()).listPushSubscriptions();}
export async function savePushSubscription(value:unknown){if(!value||typeof value!=="object")throw new ValidationError("Subscription is invalid");const body=value as Record<string,unknown>;const keys=body.keys as Record<string,unknown>|undefined;if(typeof body.endpoint!=="string"||!body.endpoint.startsWith("https://")||typeof keys?.p256dh!=="string"||typeof keys.auth!=="string")throw new ValidationError("Subscription is invalid");return(await getRepository()).upsertPushSubscription({endpoint:body.endpoint,p256dh:keys.p256dh,auth:keys.auth});}
export async function removePushSubscription(endpoint:unknown){if(typeof endpoint!=="string"||!endpoint.startsWith("https://"))throw new ValidationError("Subscription is invalid");return(await getRepository()).deletePushSubscription(endpoint);}
