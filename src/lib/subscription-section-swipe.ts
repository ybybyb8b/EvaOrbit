export type SubscriptionSectionSwipeIntent = "pending" | "horizontal" | "vertical";

export const subscriptionSectionSwipeEdge = 30;

export function subscriptionSectionSwipeIntent(dx: number, dy: number): SubscriptionSectionSwipeIntent {
  if (Math.hypot(dx, dy) < 12) return "pending";
  return Math.abs(dx) > Math.abs(dy) * 1.35 ? "horizontal" : "vertical";
}

export function subscriptionSectionSwipeStep({ dx, velocityX, width, index, count }: {
  dx: number;
  velocityX: number;
  width: number;
  index: number;
  count: number;
}) {
  const direction = dx < 0 ? 1 : -1;
  const target = index + direction;
  if (target < 0 || target >= count) return null;
  const distance = Math.max(56, Math.min(76, width * 0.16));
  return Math.abs(dx) >= distance || (Math.abs(dx) >= 28 && Math.abs(velocityX) >= 0.45) ? target : null;
}
