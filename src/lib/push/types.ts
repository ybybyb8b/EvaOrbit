export type PushSubscriptionRecord = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  lastUsedAt: string;
};

export type EvaNotificationKind = "reminder_due" | "task_due" | "drink_limit" | "meal_missing" | "weight_missing" | "daily_review" | "lucius_activity" | "lucius_comment_reply";

export type EvaPushPayload = {
  kind: EvaNotificationKind;
  title: string;
  body: string;
  url: string;
  tag?: string;
};
