import type { Subscription } from "./types";

export function validSubscriptionIconKey(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(value);
}

export function subscriptionIconSource(item: Pick<Subscription, "id" | "iconPath">): string | null {
  return item.iconPath && validSubscriptionIconKey(item.iconPath)
    ? `/api/subscriptions/${item.id}/icon?v=${item.iconPath}` : null;
}
