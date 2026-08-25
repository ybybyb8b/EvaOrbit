import type { Metadata } from "next";
import { AiChatView } from "./ai-chat-view";

export const metadata: Metadata = { title: "想想" };

export default async function AiPage({ searchParams }: { searchParams: Promise<{ prompt?: string; session?: string }> }) {
  const params = await searchParams;
  const sessionId = Number(params.session);
  return <AiChatView initialPrompt={params.prompt ?? ""} initialSessionId={Number.isSafeInteger(sessionId) && sessionId > 0 ? sessionId : null} />;
}
