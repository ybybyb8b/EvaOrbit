import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { readSoftwareLibraryIcon, resetSoftwareLibraryIcon, saveSoftwareLibraryIcon } from "@/lib/services/software-library-icon";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const version = request.nextUrl.searchParams.get("v");
    const icon = await readSoftwareLibraryIcon(parseId((await params).id), version);
    if (!icon) return new NextResponse(null, { status: 404 });
    return new NextResponse(icon.bytes, { headers: { "Content-Type": icon.mime, "Content-Length": String(icon.bytes.byteLength), "Cache-Control": version ? "private, max-age=31536000, immutable" : "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new ValidationError("请选择软件图标");
    const item = await saveSoftwareLibraryIcon(parseId((await params).id), file);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "软件不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    const item = await resetSoftwareLibraryIcon(parseId((await params).id));
    return item ? NextResponse.json(item) : NextResponse.json({ error: "软件不存在" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
