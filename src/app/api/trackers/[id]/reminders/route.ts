import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { createTrackerReminder, deleteTrackerReminder } from "@/lib/services/tracker";
import { parseNewTrackerReminder } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) { try { return NextResponse.json(await createTrackerReminder(parseNewTrackerReminder(await request.json(), parseId((await params).id))), { status: 201 }); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest) { try { return await deleteTrackerReminder(parseId(request.nextUrl.searchParams.get("reminderId") ?? "")) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Reminder 不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
