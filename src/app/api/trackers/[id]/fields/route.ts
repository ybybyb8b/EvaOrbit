import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { createTrackerField, purgeTrackerField, updateTrackerField } from "@/lib/services/tracker";
import { parseNewTrackerField, parseTrackerFieldPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) { try { return NextResponse.json(await createTrackerField(parseNewTrackerField(await request.json(), parseId((await params).id))), { status: 201 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, { params }: Context) {
  try { const field = await updateTrackerField(parseId((await params).id), parseId(request.nextUrl.searchParams.get("fieldId") ?? ""), parseTrackerFieldPatch(await request.json())); return field ? NextResponse.json(field) : NextResponse.json({ error: "字段不存在" }, { status: 404 }); } catch (error) { return apiError(error); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const trackerId = parseId((await params).id), fieldId = parseId(request.nextUrl.searchParams.get("fieldId") ?? "");
    // Older clients use DELETE to archive; permanent deletion requires an explicit flag.
    const result = request.nextUrl.searchParams.get("permanent") === "true" ? await purgeTrackerField(trackerId, fieldId) : await updateTrackerField(trackerId, fieldId, { archivedAt: new Date().toISOString() });
    return result ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "字段不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
