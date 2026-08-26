import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { createTrackerField, deleteTrackerField } from "@/lib/services/tracker";
import { parseNewTrackerField } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) { try { return NextResponse.json(await createTrackerField(parseNewTrackerField(await request.json(), parseId((await params).id))), { status: 201 }); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest) { try { return await deleteTrackerField(parseId(request.nextUrl.searchParams.get("fieldId") ?? "")) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "字段不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
