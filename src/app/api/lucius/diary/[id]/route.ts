import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteLuciusDiaryEntry, getLuciusDiaryEntry, updateLuciusDiaryEntry } from "@/lib/services/lucius";
import { parseLuciusDiaryPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) { try { const item = await getLuciusDiaryEntry(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "Diary entry not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, { params }: Context) { try { const item = await updateLuciusDiaryEntry(parseId((await params).id), parseLuciusDiaryPatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "Diary entry not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function DELETE(_: NextRequest, { params }: Context) { try { return await deleteLuciusDiaryEntry(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Diary entry not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
