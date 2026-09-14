import type {Metadata} from "next";
import {listSubscriptions} from "@/lib/services/subscription";
import {SubscriptionsView} from "./subscriptions-view";
export const metadata:Metadata={title:"Subscriptions"};
export const dynamic="force-dynamic";
export default async function SubscriptionsPage(){return <SubscriptionsView initial={await listSubscriptions()}/>;}
