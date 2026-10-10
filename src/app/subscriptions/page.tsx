import type { Metadata } from "next";
import { listSubscriptions } from "@/lib/services/subscription";
import { getRepository } from "@/lib/repositories";
import { dateInEvaOrbit } from "@/lib/time";
import { SubscriptionsView } from "./subscriptions-view";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const items = await listSubscriptions({ limit: 500 });
  const repository = await getRepository();
  const payments = (await Promise.all(items.map(item => repository.listSubscriptionPayments(item.id)))).flat();
  return <SubscriptionsView initial={items} payments={payments} today={dateInEvaOrbit()} />;
}
