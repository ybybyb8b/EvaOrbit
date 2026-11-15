import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { parseCatRoutine } from "@/lib/cats-validation";
import { deleteCatRoutine, updateCatRoutine } from "@/lib/services/cat-routine";
import { undoCatRoutineCompletion } from "@/lib/services/cats";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const id=parseId((await params).id),body=await request.json();
    if(body?.undoEventId!==undefined){
      await undoCatRoutineCompletion(id,parseId(String(body.undoEventId)));
      return new NextResponse(null,{status:204});
    }
    const input: Record<string, unknown> = { ...parseCatRoutine(body) };
    delete input.reminderId;
    const routine = await updateCatRoutine(id, input);
    return routine ? NextResponse.json(routine) : NextResponse.json({ error: "Routine not found" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await deleteCatRoutine(parseId((await params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Routine not found" }, { status: 404 }); }
  catch (error) { return apiError(error); }
}
