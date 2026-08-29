import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteChronicleEntry, getChronicleEntry, updateChronicleEntry } from "@/lib/services/chronicle";
import { parseChronicleEntryPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try {
    const entry = await getChronicleEntry(parseId((await params).id));
    return entry ? NextResponse.json(entry) : NextResponse.json({ error: "Chronicle entry not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const entry = await updateChronicleEntry(parseId((await params).id), parseChronicleEntryPatch(await request.json()));
    return entry ? NextResponse.json(entry) : NextResponse.json({ error: "Chronicle entry not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    return await deleteChronicleEntry(parseId((await params).id))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "Chronicle entry not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
