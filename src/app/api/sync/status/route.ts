import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listInbox } from "@/lib/services/inbox";

export const runtime = "nodejs";

export async function GET() {
  try {
    await listInbox("all");
    return NextResponse.json({ ok: true, serverTime: new Date().toISOString() });
  } catch (error) {
    return apiError(error);
  }
}
