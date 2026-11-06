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
// Historical rows predate the bridge's notice flag. Match the known Hermes wording only.
const legacyGatewayNotices = [
  /^💾\s*(?:Self-improvement review:|自我改进回顾：|自我改進檢閱：)\s*\S/i,
  /^⚠️?\s*Hermes is (?:shutting down|restarting) — your current task will be interrupted\./,
  /^⚠️?\s*Hermes 正在(?:关闭|重启)——你当前的任务将被中断。/,
  /^⚠️?\s*Hermes 正在(?:關閉|重新啟動) — 你目前的任務將被中斷。/,
  /^♻️?\s*Gateway (?:online — Hermes is back and ready|restarted successfully\. Your session continues)\.$/,
  /^♻️?\s*(?:网关已上线——Hermes 已恢复就绪。|网关已成功重启。你的会话继续有效。)$/,
  /^♻️?\s*(?:閘道已上線 — Hermes 已恢復並準備就緒。|閘道已成功重新啟動。你的工作階段將繼續。)$/,
];
const legacyHomeNotices = [
  /^✅\s*Home channel set to \*\*EvaOrbit\*\* \(ID: ([\da-f-]+)\)\.\s*Cron jobs and cross-platform messages will be delivered here\.$/i,
  /^✅\s*主频道已设置为 \*\*EvaOrbit\*\*（ID：([\da-f-]+)）。\s*定时任务和跨平台消息将发送到此处。$/i,
  /^✅\s*主頻道已設定為 \*\*EvaOrbit\*\*（ID：([\da-f-]+)）。\s*排程任務和跨平台訊息將傳送至此處。$/i,
];

export function hermesNotice(message: HermesMessage) {
  if (message.role !== "assistant") return false;
  if (message.presentation?.notice === true) return true;
  if (message.presentation?.kind || message.presentation?.reasoning) return false;
  const content = message.content.trim();
  return legacyHomeNotices.some(pattern => pattern.exec(content)?.[1].toLowerCase() === message.conversation_id)
    || (!message.reply_to && legacyGatewayNotices.some(pattern => pattern.test(content)));
}
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
