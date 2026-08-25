export type PushSubscriptionRecord = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  lastUsedAt: string;
};

export type EvaNotificationKind = "task_due" | "drink_limit" | "meal_missing" | "daily_review";

export type EvaPushPayload = {
  kind: EvaNotificationKind;
  title: string;
  body: string;
  url: string;
  tag?: string;
};
