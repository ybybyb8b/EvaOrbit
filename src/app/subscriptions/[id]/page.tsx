import {notFound} from "next/navigation";
import {getSubscriptionDetail} from "@/lib/services/subscription";
import {SubscriptionDetailView} from "./subscription-detail-view";
export const dynamic="force-dynamic";
export default async function SubscriptionDetailPage({params}:{params:Promise<{id:string}>}){const{id}=await params,subscriptionId=Number(id);if(!Number.isSafeInteger(subscriptionId)||subscriptionId<=0)notFound();const item=await getSubscriptionDetail(subscriptionId);if(!item)notFound();return <SubscriptionDetailView initial={item}/>;}
