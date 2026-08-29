import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteLuciusCase, getLuciusCase, updateLuciusCase } from "@/lib/services/lucius";
import { parseLuciusCasePatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) { try { const item = await getLuciusCase(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "Lucius case not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, { params }: Context) { try { const item = await updateLuciusCase(parseId((await params).id), parseLuciusCasePatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "Lucius case not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function DELETE(_: NextRequest, { params }: Context) { try { return await deleteLuciusCase(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Lucius case not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
