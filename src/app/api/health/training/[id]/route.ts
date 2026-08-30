import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteTrainingLog, getTrainingLog, updateTrainingLog } from "@/lib/services/training";
import { parseTrainingLogPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try { const item = await getTrainingLog(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "Training log not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try { const item = await updateTrainingLog(parseId((await params).id), parseTrainingLogPatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "Training log not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await deleteTrainingLog(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Training log not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
