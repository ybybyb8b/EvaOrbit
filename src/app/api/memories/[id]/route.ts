import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteMemory, updateMemory } from "@/lib/services/evaorbit";
import { parseMemoryPatch } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const memory = await updateMemory(parseId((await params).id), parseMemoryPatch(await request.json()));
    return memory ? NextResponse.json(memory) : NextResponse.json({ error: "记忆不存在" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    return await deleteMemory(parseId((await params).id))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "记忆不存在" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
