import { NextRequest, NextResponse } from "next/server";
import { eventKitApiError } from "@/lib/eventkit-api";
import { HttpError } from "@/lib/errors";
import { eventKitCanonicalSnapshot, eventKitSnapshotHash } from "@/lib/eventkit-sync";
import { currentNativeAccount } from "@/lib/native-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseNewCalendarEvent, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    if (!await currentNativeAccount()) throw new HttpError("登录已失效", 401);
    const body = await request.json();
    if (!body || typeof body !== "object" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.installationId ?? "")) throw new ValidationError("installationId 格式不正确");
    const apple = body.apple;
    if (!apple || typeof apple !== "object" || ["calendarItemIdentifier", "calendarIdentifier", "sourceIdentifier"].some(key => typeof apple[key] !== "string" || !apple[key] || apple[key].length > 500)) throw new ValidationError("EventKit identifier 格式不正确");
    if (apple.externalIdentifier != null && (typeof apple.externalIdentifier !== "string" || !apple.externalIdentifier || apple.externalIdentifier.length > 500)) throw new ValidationError("externalIdentifier 格式不正确");
    if (apple.lastModifiedAt != null && (typeof apple.lastModifiedAt !== "string" || Number.isNaN(Date.parse(apple.lastModifiedAt)))) throw new ValidationError("lastModifiedAt 格式不正确");
    const snapshot = eventKitCanonicalSnapshot(parseNewCalendarEvent(body.snapshot));
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("import_eventkit_calendar_event", { p_installation_id: body.installationId, p_apple: apple, p_snapshot: snapshot, p_hash: await eventKitSnapshotHash(snapshot) });
    if (error) throw error;
    return NextResponse.json({ id: Number(data) });
  } catch (error) { return eventKitApiError(error); }
}
