import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { readSubscriptionIcon, resetSubscriptionIcon, saveSubscriptionIcon } from "@/lib/services/subscription-icon";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const version = request.nextUrl.searchParams.get("v");
    const icon = await readSubscriptionIcon(parseId((await params).id), version);
    if (!icon) return new NextResponse(null, { status: 404 });
    return new NextResponse(icon.bytes, { headers: { "Content-Type": icon.mime, "Content-Length": String(icon.bytes.byteLength), "Cache-Control": version ? "private, max-age=31536000, immutable" : "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new ValidationError("请选择订阅图标");
    const item = await saveSubscriptionIcon(parseId((await params).id), file);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "订阅不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    const item = await resetSubscriptionIcon(parseId((await params).id));
    return item ? NextResponse.json(item) : NextResponse.json({ error: "订阅不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
