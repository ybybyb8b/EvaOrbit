import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveAiApiKey } from "@/lib/ai-secret";
import { supabaseConfig } from "@/lib/config";
import { hermesNotificationPayload, type HermesPush } from "@/lib/hermes-notification";
import { sendBark } from "@/lib/push/bark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!/^eo_[A-Za-z0-9_-]{40,150}$/.test(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const input = await request.json().catch(() => null);
  if (!input || Object.keys(input).length !== 1 || typeof input.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.id)) return NextResponse.json({ error: "Invalid message" }, { status: 400, headers });
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "Notification delivery unavailable" }, { status: 503, headers });
  const client = createClient(supabaseConfig().url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const claim = randomUUID();
  try {
    const result = await client.rpc("hermes_claim_push", { p_token: token, p_message: input.id, p_claim: claim });
    if (result.error) return NextResponse.json({ error: result.error.message.includes("HERMES_TOKEN") ? "Unauthorized" : "Notification claim failed" }, { status: result.error.message.includes("HERMES_TOKEN") ? 401 : 503, headers });
    const message = result.data as HermesPush & { pending?: boolean; skipped?: boolean; ciphertext: string; iv: string; authTag: string; openInHost: boolean };
    if (message.pending || message.skipped) return NextResponse.json({ pending: Boolean(message.pending), skipped: Boolean(message.skipped) }, { headers });
    let accepted = false;
    try { accepted = await sendBark(resolveAiApiKey(message), hermesNotificationPayload(message), fetch, message.openInHost); } catch { /* Finish the lease with a safe diagnostic; never expose stored credentials. */ }
    const finished = await client.rpc("hermes_finish_push", { p_claim: claim, p_success: accepted, p_error: accepted ? null : "BARK_NOT_ACCEPTED" });
    if (finished.error) throw new Error("Notification receipt failed");
    return NextResponse.json({ accepted, pending: !accepted }, { headers });
  } catch { return NextResponse.json({ error: "Notification delivery unavailable" }, { status: 503, headers }); }
}
