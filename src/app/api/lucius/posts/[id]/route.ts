import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteLuciusPost, getLuciusPost, updateLuciusPost } from "@/lib/services/lucius";
import { parseLuciusPostPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try { const item = await getLuciusPost(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "Lucius post not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try { const item = await updateLuciusPost(parseId((await params).id), parseLuciusPostPatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "Lucius post not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await deleteLuciusPost(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Lucius post not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
