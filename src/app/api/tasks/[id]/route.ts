import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteTask, updateTask } from "@/lib/services/evaorbit";
import { parseTaskPatch } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const task = await updateTask(parseId((await params).id), parseTaskPatch(await request.json()));
    return task ? NextResponse.json(task) : NextResponse.json({ error: "任务不存在" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    return await deleteTask(parseId((await params).id))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "任务不存在" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
