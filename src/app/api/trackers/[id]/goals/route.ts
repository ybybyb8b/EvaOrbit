import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { createTrackerGoal, deleteTrackerGoal } from "@/lib/services/tracker";
import { parseNewTrackerGoal } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) { try { return NextResponse.json(await createTrackerGoal(parseNewTrackerGoal(await request.json(), parseId((await params).id))), { status: 201 }); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest) { try { return await deleteTrackerGoal(parseId(request.nextUrl.searchParams.get("goalId") ?? "")) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Goal 不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
