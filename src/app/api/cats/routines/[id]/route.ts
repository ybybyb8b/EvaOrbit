import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { parseCatRoutine } from "@/lib/cats-validation";
import { archiveCatRoutine, updateCatRoutine } from "@/lib/services/cat-routine";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const input: Record<string, unknown> = { ...parseCatRoutine(await request.json()) };
    delete input.reminderId;
    const routine = await updateCatRoutine(parseId((await params).id), input);
    return routine ? NextResponse.json(routine) : NextResponse.json({ error: "Routine not found" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await archiveCatRoutine(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Routine not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
