import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteMediaViewing, updateMediaViewing } from "@/lib/services/media";
import { parseMediaViewing } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; viewingId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id, viewingId } = await params;
    const { watchedDate } = parseMediaViewing(await request.json());
    const viewing = await updateMediaViewing(parseId(id), parseId(viewingId), watchedDate);
    return viewing ? NextResponse.json(viewing) : NextResponse.json({ error: "Viewing not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    const { id, viewingId } = await params;
    return await deleteMediaViewing(parseId(id), parseId(viewingId))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "Viewing not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
