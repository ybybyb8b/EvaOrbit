import { z } from "zod";

export type HermesStatus = "queued" | "received" | "processing" | "done" | "failed" | "interrupted";
export type HermesToolActivity = {
  attemptId: string;
  total: number;
  running: number;
  failed: number;
  tools: { name: string; count: number }[];
};
export type HermesPresentation = { kind?: "note" | "choices" | "response" | "command"; notice?: boolean; reasoning?: string; promptId?: string; options?: string[]; multi?: boolean; state?: "pending" | "answered" | "expired"; toolActivity?: HermesToolActivity };
export type HermesCommand = { name: string; description: string; localizedDescription?: string; argsHint: string; aliases: string[] };
export type HermesMessage = { id: string; seq: number; conversation_id: string; role: "user" | "assistant"; content: string; status: HermesStatus; attempt_id: string; reply_to: string | null; error: string | null; created_at: string; updated_at: string; presentation?: HermesPresentation };
export type HermesConversation = { id: string; title: string; created_at: string; updated_at: string };
export type HermesData = { connection: { paired: boolean; online: boolean; lastSeenAt: string | null; commands?: HermesCommand[] }; conversations: HermesConversation[]; messages: HermesMessage[]; hasMore: boolean };
export type HermesPairing = { url: string; key: string; token: string; userId: string };

export const hermesInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), id: z.uuid(), conversationId: z.uuid(), content: z.string().max(20000).refine(content => Boolean(content.trim())), note: z.boolean().optional(), responseTo: z.uuid().optional() }).strict(),
  z.object({ action: z.literal("retry"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("clear"), conversationId: z.uuid() }).strict(),
  z.object({ action: z.literal("rename"), conversationId: z.uuid(), title: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal("seen"), conversationId: z.uuid(), seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
  z.object({ action: z.enum(["pair", "disconnect"]) }).strict(),
]);
export const hermesRead = z.object({ conversationId: z.uuid().optional(), before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), pending: z.array(z.uuid()).max(100).default([]) });
export const hermesPending = (message: HermesMessage) => ["queued", "received", "processing"].includes(message.status) || message.presentation?.state === "pending";
export const hermesNotice = (message: HermesMessage) => message.role === "assistant" && (
  message.presentation?.notice === true ||
  (!message.reply_to && !message.presentation?.kind && !message.presentation?.reasoning && /^💾\s*(?:Self-improvement review:|自我改进回顾：|自我改進檢閱：)\s*\S/i.test(message.content))
);
export function mergeHermesMessages(current: HermesMessage[], incoming: HermesMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
export function hermesStatusText(message: HermesMessage, online: boolean | undefined, english: boolean) {
  const states: Record<HermesStatus, [string, string]> = {
    queued: online === false ? ["Saved · waiting for Hermes to come online", "已保存 · 等待 Hermes 上线"] : ["Waiting for Hermes", "等待 Hermes 接收"],
    received: ["Received by Hermes", "Hermes 已接收"], processing: ["Sent", "已发送"],
    done: ["Completed", "已完成"], failed: ["Could not finish", "处理未完成"], interrupted: ["Interrupted · check Hermes before retrying", "处理可能中断 · 重试前请检查 Hermes"],
  };
  return states[message.status][english ? 0 : 1];
}

export function hermesResponseChoices(message: HermesMessage, question?: HermesMessage): string[] | undefined {
  if (message.presentation?.kind !== "response" || question && !question.presentation?.multi) return;
  try {
    const values: unknown = JSON.parse(message.content);
    if (Array.isArray(values) && values.length && values.every(value => typeof value === "string" &&
      (!question || question.presentation?.options?.includes(value)))) return values;
  } catch { /* A free-text answer is rendered as written. */ }
}
