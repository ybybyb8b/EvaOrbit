import type { Metadata } from "next";
import { HermesChat } from "@/components/hermes-chat";
import { PageBackButton } from "@/components/page-back-button";
import { hermesRead } from "@/lib/hermes";
import { getClientCacheScope } from "@/lib/services/home-cache-scope";

export const metadata: Metadata = { title: "Hermes" };

export default async function AiPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const [params, scope] = await Promise.all([searchParams, getClientCacheScope()]);
  const selected = hermesRead.safeParse({ conversationId: params.conversation });
  return <HermesChat key={scope} scope={scope} back={<PageBackButton />} initialConversationId={selected.success ? selected.data.conversationId : undefined} />;
}
