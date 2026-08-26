import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteChatSession, getChatSession, updateChatSession } from "@/lib/services/evaorbit";
import { parseChatSessionPatch } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getChatSession(parseId((await context.params).id));
    return session ? NextResponse.json(session) : NextResponse.json({ error: "会话不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await context.params).id);
    if (!await getChatSession(id)) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    const patch = parseChatSessionPatch(await request.json());
    return NextResponse.json(await updateChatSession(id, patch));
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const deleted = await deleteChatSession(parseId((await context.params).id));
    return deleted ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "会话不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
