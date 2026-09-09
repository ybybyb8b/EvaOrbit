import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteWeightRecord, getWeightRecord, updateWeightRecord } from "@/lib/services/weight";
import { parseWeightRecordPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try { const item = await getWeightRecord(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "Weight record not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  try { const item = await updateWeightRecord(parseId((await params).id), parseWeightRecordPatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "Weight record not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await deleteWeightRecord(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Weight record not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
