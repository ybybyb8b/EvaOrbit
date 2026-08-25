import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { getChatSession, listChatMessages } from "@/lib/services/evaorbit";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await context.params).id);
    if (!await getChatSession(id)) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    return NextResponse.json(await listChatMessages(id));
  } catch (error) { return apiError(error); }
}
