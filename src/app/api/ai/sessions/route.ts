import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createChatSession, listChatSessions } from "@/lib/services/evaorbit";
import { parseNewChatSession } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listChatSessions());
}

export async function POST(request: NextRequest) {
  try {
    const { title } = parseNewChatSession(await request.json());
    return NextResponse.json(await createChatSession(title), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
