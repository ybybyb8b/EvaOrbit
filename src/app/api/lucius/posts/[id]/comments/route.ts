import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createLuciusPostComment, listLuciusPostComments } from "@/lib/services/lucius";
import { parseNewLuciusPostComment, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Lucius Post ID 格式不正确");
  return id;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await listLuciusPostComments({ postId: parseId((await params).id), limit: 500 })); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const postId = parseId((await params).id);
    return NextResponse.json(await createLuciusPostComment(parseNewLuciusPostComment(await request.json(), postId, "user")), { status: 201 });
  } catch (error) { return apiError(error); }
}
