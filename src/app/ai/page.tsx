import type { Metadata } from "next";
import { HermesChat } from "@/components/hermes-chat";
import { hermesRead } from "@/lib/hermes";

export const metadata: Metadata = { title: "Hermes" };

export default async function AiPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const params = await searchParams;
  const selected = hermesRead.safeParse({ conversationId: params.conversation });
  return <HermesChat initialConversationId={selected.success ? selected.data.conversationId : undefined} />;
}
