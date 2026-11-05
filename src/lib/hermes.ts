import { z } from "zod";

export type HermesStatus = "queued" | "received" | "processing" | "done" | "failed" | "interrupted";
export type HermesPresentation = { kind?: "note" | "choices" | "response" | "command"; reasoning?: string; promptId?: string; options?: string[]; multi?: boolean; state?: "pending" | "answered" | "expired" };
export type HermesCommand = { name: string; description: string; localizedDescription?: string; argsHint: string; aliases: string[] };
export type HermesMessage = { id: string; seq: number; conversation_id: string; role: "user" | "assistant"; content: string; status: HermesStatus; attempt_id: string; reply_to: string | null; error: string | null; created_at: string; updated_at: string; presentation?: HermesPresentation };
export type HermesConversation = { id: string; title: string; created_at: string; updated_at: string };
export type HermesData = { connection: { paired: boolean; online: boolean; lastSeenAt: string | null; commands?: HermesCommand[] }; conversations: HermesConversation[]; messages: HermesMessage[]; hasMore: boolean };
export type HermesPairing = { url: string; key: string; token: string; userId: string };

export const hermesInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), id: z.uuid(), conversationId: z.uuid(), content: z.string().trim().min(1).max(20000), note: z.boolean().optional(), responseTo: z.uuid().optional() }).strict(),
  z.object({ action: z.literal("retry"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("clear"), conversationId: z.uuid() }).strict(),
  z.object({ action: z.literal("seen"), conversationId: z.uuid(), seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
  z.object({ action: z.enum(["pair", "disconnect"]) }).strict(),
]);
export const hermesRead = z.object({ conversationId: z.uuid().optional(), before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), pending: z.array(z.uuid()).max(100).default([]) });
export const hermesPending = (message: HermesMessage) => ["queued", "received", "processing"].includes(message.status) || message.presentation?.state === "pending";
export function mergeHermesMessages(current: HermesMessage[], incoming: HermesMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
export function hermesStatusText(message: HermesMessage, online: boolean, english: boolean) {
  const states: Record<HermesStatus, [string, string]> = {
    queued: [online ? "Waiting for Hermes" : "Saved · waiting for Hermes to come online", online ? "等待 Hermes 接收" : "已保存 · 等待 Hermes 上线"],
    received: ["Received by Hermes", "Hermes 已接收"], processing: ["Hermes is working…", "Hermes 正在处理…"],
    done: ["Completed", "已完成"], failed: ["Could not finish", "处理未完成"], interrupted: ["Interrupted · check Hermes before retrying", "处理可能中断 · 重试前请检查 Hermes"],
  };
  return states[message.status][english ? 0 : 1];
}
