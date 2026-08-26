import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteTracker, getTrackerDetail, updateTracker } from "@/lib/services/tracker";
import { parseTrackerPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) { try { const detail = await getTrackerDetail(parseId((await params).id), request.nextUrl.searchParams.get("query") ?? ""); return detail ? NextResponse.json(detail) : NextResponse.json({ error: "Tracker 不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, { params }: Context) { try { const tracker = await updateTracker(parseId((await params).id), parseTrackerPatch(await request.json())); return tracker ? NextResponse.json(tracker) : NextResponse.json({ error: "Tracker 不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function DELETE(_: NextRequest, { params }: Context) { try { return await deleteTracker(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Tracker 不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
