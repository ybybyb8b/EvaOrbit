import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { memoryUuid, parseMemoryEntityPatch } from "@/lib/memory-graph-validation";
import { updateMemoryEntity } from "@/lib/services/memory-graph";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = memoryUuid((await params).id);
    const entity = await updateMemoryEntity(id, parseMemoryEntityPatch(await request.json()));
    return entity ? NextResponse.json(entity) : NextResponse.json({ error: "Memory entity not found." }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
