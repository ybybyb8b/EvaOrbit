import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { readTrackerIcon, resetTrackerIcon, saveTrackerIcon } from "@/lib/services/tracker-icon";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try {
    const icon = await readTrackerIcon(parseId((await params).id));
    if (!icon) return new NextResponse(null, { status: 404 });
    return new NextResponse(icon.bytes, { headers: { "Content-Type": icon.mime, "Content-Length": String(icon.bytes.byteLength), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new ValidationError("请选择 Tracker 图片");
    const tracker = await saveTrackerIcon(parseId((await params).id), file);
    return NextResponse.json(tracker);
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    const tracker = await resetTrackerIcon(parseId((await params).id));
    return tracker ? NextResponse.json(tracker) : NextResponse.json({ error: "Tracker 不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
