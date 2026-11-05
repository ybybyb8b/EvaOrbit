import type { EvaPushPayload } from "./push/types.ts";

export type HermesPush = { kind: "reply" | "question" | "error"; conversationId: string; content: string; english: boolean };
export function hermesNotificationPayload(message: HermesPush): EvaPushPayload {
  const { kind, english } = message;
  const preview = message.content.replace(/```[\s\S]*?```/g,"[code]").replace(/!?(\[[^\]]*\])\([^)]*\)/g,"$1").replace(/[#*_`>\[\]]/g,"").replace(/\s+/g," ").trim().slice(0,140);
  return {
    kind: "hermes_message",
    title: kind === "question" ? (english ? "Hermes needs your answer" : "Hermes 在等你回答") : kind === "error" ? (english ? "Hermes could not finish" : "Hermes 处理未完成") : (english ? "Hermes replied" : "Hermes 有新回复"),
    body: kind === "error" ? (english ? "Open the conversation to check the error before retrying." : "打开对话查看具体报错，再决定是否重试。") : preview || (english ? "Open the conversation to view the message." : "打开对话查看消息。"),
    url: `/ai?conversation=${encodeURIComponent(message.conversationId)}`,
    tag: `hermes-${message.conversationId}`,
  };
}
