import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteMedia, getMediaDetail, updateMedia } from "@/lib/services/media";
import { parseMediaPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try {
    const media = await getMediaDetail(parseId((await params).id));
    return media ? NextResponse.json(media) : NextResponse.json({ error: "Media not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const media = await updateMedia(parseId((await params).id), parseMediaPatch(await request.json()));
    return media ? NextResponse.json(media) : NextResponse.json({ error: "Media not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    return await deleteMedia(parseId((await params).id))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "Media not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
