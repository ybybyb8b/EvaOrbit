import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { createTrackerEntry, deleteTrackerEntry, updateTrackerEntry } from "@/lib/services/tracker";
import { parseNewTrackerEntry, parseTrackerEntryPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) { try { return NextResponse.json(await createTrackerEntry(parseNewTrackerEntry(await request.json(), parseId((await params).id))), { status: 201 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest) { try { const entryId = parseId(request.nextUrl.searchParams.get("entryId") ?? ""); const entry = await updateTrackerEntry(entryId, parseTrackerEntryPatch(await request.json())); return entry ? NextResponse.json(entry) : NextResponse.json({ error: "记录不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest) { try { return await deleteTrackerEntry(parseId(request.nextUrl.searchParams.get("entryId") ?? "")) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "记录不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
