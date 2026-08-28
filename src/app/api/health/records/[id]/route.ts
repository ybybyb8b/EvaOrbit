import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteHealthRecord, getHealthRecord, updateHealthRecord } from "@/lib/services/health";
import { parseHealthRecordPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try {
    const item = await getHealthRecord(parseId((await params).id));
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Health record not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const item = await updateHealthRecord(parseId((await params).id), parseHealthRecordPatch(await request.json()));
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Health record not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    return await deleteHealthRecord(parseId((await params).id))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "Health record not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
