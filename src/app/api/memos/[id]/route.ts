import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteMemo, getMemo, updateMemo } from "@/lib/services/memo";
import { parseMemoPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try { const item = await getMemo(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "Memo not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  try { const item = await updateMemo(parseId((await params).id), parseMemoPatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "Memo not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await deleteMemo(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Memo not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
