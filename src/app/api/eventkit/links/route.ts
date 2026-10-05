import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eventKitApiError } from "@/lib/eventkit-api";
import { HttpError } from "@/lib/errors";
import { markMissingEventKitRecords, projectEventKitLinks, readEventKitRows } from "@/lib/eventkit-links";
import { currentNativeAccount } from "@/lib/native-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function account() { const value = await currentNativeAccount(); if (!value) throw new HttpError("登录已失效", 401); return value; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function installation(value: unknown) { if (typeof value !== "string" || !uuid.test(value)) throw new ValidationError("installationId 格式不正确"); return value; }
function identifier(value: unknown, label: string, optional = false) { if (optional && (value === null || value === undefined)) return null; if (typeof value !== "string" || !value || value.length > 500) throw new ValidationError(`${label} 格式不正确`); return value; }
function logicalInput(body: Record<string, unknown>) {
  if (!["task", "reminder", "calendar_event"].includes(String(body.entityType)) || !Number.isSafeInteger(body.eoId) || Number(body.eoId) < 1 || !["event", "reminder"].includes(String(body.eventkitEntityType)) || (body.entityType === "calendar_event") !== (body.eventkitEntityType === "event")) throw new ValidationError("EventKit mapping 格式不正确");
  if (typeof body.lastSyncedHash !== "string" || !/^[0-9a-f]{64}$/.test(body.lastSyncedHash) || !body.lastSyncedSnapshot || typeof body.lastSyncedSnapshot !== "object" || Array.isArray(body.lastSyncedSnapshot)) throw new ValidationError("EventKit snapshot 格式不正确");
  return { p_entity_type: body.entityType, p_eo_id: body.eoId, p_kind: body.eventkitEntityType, p_snapshot: body.lastSyncedSnapshot, p_hash: body.lastSyncedHash };
}
export async function GET(request: NextRequest) {
  try {
    const user = await account(), installationId = installation(request.nextUrl.searchParams.get("installationId"));
    if (request.nextUrl.searchParams.get("protocol") !== "2") throw new HttpError("请刷新 EvaOrbit 后恢复 EventKit 同步", 409);
    const client = await createSupabaseServerClient();
    function readAll(table: string, columns = "*") {
      return readEventKitRows(async cursor => {
        let query = client.from(table).select(columns).eq("user_id", user.id).order("id");
        if (cursor !== undefined) query = query.gt("id", cursor);
        const { data, error } = await query.limit(500).returns<Record<string, unknown>[]>();
        if (error) throw error;
        return data ?? [];
      });
    }
    // Check existence across the account, never against a window or truncated list.
    const [logical, bindings, tasks, reminders, events] = await Promise.all([readAll("eventkit_logical_links"), readAll("eventkit_links"), readAll("tasks", "id"), readAll("reminders", "id"), readAll("calendar_events", "id")]);
    return NextResponse.json(markMissingEventKitRecords(projectEventKitLinks(logical, bindings, installationId), { task: tasks, reminder: reminders, calendar_event: events }));
  } catch (error) { return eventKitApiError(error); }
}
// Reserve the marker before touching Apple; retries use the same server UUID.
export async function POST(request: NextRequest) {
  try {
    await account(); const body = await request.json() as Record<string, unknown>;
    if (body.nextOccurrence !== undefined && typeof body.nextOccurrence !== "boolean") throw new ValidationError("nextOccurrence 格式不正确");
    const client = await createSupabaseServerClient();
    const input = logicalInput(body);
    if (input.p_kind !== "reminder") throw new ValidationError("仅 Reminder 镜像需要预留恢复标记");
    const { data, error } = await client.rpc("reserve_eventkit_link", { ...input, p_next_occurrence: body.nextOccurrence ?? false, p_prepare_creation: true, p_creation_lease: randomUUID() });
    if (error) throw error; return NextResponse.json(data);
  } catch (error) { return eventKitApiError(error); }
}
export async function PUT(request: NextRequest) {
  try {
    await account(); const body = await request.json() as Record<string, unknown>, input = logicalInput(body);
    if (input.p_kind === "reminder" && !["eo", "apple"].includes(String(body.notificationOwner))) throw new ValidationError("EventKit notification owner 格式不正确");
    if (body.appleLastModifiedAt != null && (typeof body.appleLastModifiedAt !== "string" || !Number.isFinite(Date.parse(body.appleLastModifiedAt)))) throw new ValidationError("appleLastModifiedAt 格式不正确");
    const apple = { calendarItemIdentifier: identifier(body.calendarItemIdentifier, "calendarItemIdentifier"), externalIdentifier: identifier(body.externalIdentifier, "externalIdentifier", true), calendarIdentifier: identifier(body.calendarIdentifier, "calendarIdentifier"), sourceIdentifier: identifier(body.sourceIdentifier, "sourceIdentifier"), lastModifiedAt: body.appleLastModifiedAt ?? null };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("bind_eventkit_link", { ...input, p_installation_id: installation(body.installationId), p_apple: apple });
    if (error) throw error;
    const deliveryChannel = body.notificationOwner === "apple" ? "apple_reminders" : "pwa";
    if (body.entityType === "task") { const result = await client.from("task_reminders").update({ delivery_channel: deliveryChannel }).eq("task_id", body.eoId); if (result.error) throw result.error; }
    else if (body.entityType === "reminder") { const result = await client.from("reminders").update({ delivery_channel: deliveryChannel }).eq("id", body.eoId); if (result.error) throw result.error; }
    return NextResponse.json(data);
  } catch (error) { return eventKitApiError(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    await account(); const body = await request.json() as Record<string, unknown>, id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError("mapping id 格式不正确");
    const client = await createSupabaseServerClient(), result = await client.from("eventkit_links").delete().eq("id", id);
    if (result.error) throw result.error;
    // A local binding removal never removes the account relationship or changes ownership.
    return new NextResponse(null, { status: 204 });
  } catch (error) { return eventKitApiError(error); }
}
