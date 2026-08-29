import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { addMediaRewatch, getMediaDetail } from "@/lib/services/media";
import { parseMediaViewing } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try {
    const media = await getMediaDetail(parseId((await params).id));
    return media ? NextResponse.json(media.viewings) : NextResponse.json({ error: "Media not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const mediaId = parseId((await params).id);
    const { watchedDate } = parseMediaViewing(await request.json());
    return NextResponse.json(await addMediaRewatch(mediaId, watchedDate), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
