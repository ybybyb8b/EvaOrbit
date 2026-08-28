import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { readCatAvatar, resetCatAvatar, saveCatAvatar } from "@/lib/services/cat-avatar";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) { try { const avatar = await readCatAvatar(parseId((await params).id)); if (!avatar) return new NextResponse(null, { status: 404 }); return new NextResponse(avatar.bytes, { headers: { "Content-Type": avatar.mime, "Content-Length": String(avatar.bytes.byteLength), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } }); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest, { params }: Context) { try { const file = (await request.formData()).get("file"); if (!(file instanceof File)) throw new ValidationError("Choose a cat photo"); return NextResponse.json(await saveCatAvatar(parseId((await params).id), file)); } catch (error) { return apiError(error); } }
export async function DELETE(_: NextRequest, { params }: Context) { try { const pet = await resetCatAvatar(parseId((await params).id)); return pet ? NextResponse.json(pet) : NextResponse.json({ error: "Cat not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
