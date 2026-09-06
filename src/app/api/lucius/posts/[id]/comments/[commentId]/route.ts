import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { deleteLuciusPostComment, getLuciusPostComment, updateLuciusPostComment } from "@/lib/services/lucius";
import { parseLuciusPostCommentPatch, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

function parseId(value: string, field: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`${field}格式不正确`);
  return id;
}

async function ids(params: Promise<{ id: string; commentId: string }>) {
  const value = await params;
  return { postId: parseId(value.id, "Lucius Post ID"), commentId: parseId(value.commentId, "评论 ID") };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const { postId, commentId } = await ids(params);
    const existing = await getLuciusPostComment(commentId);
    if (!existing || existing.postId !== postId) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    return NextResponse.json(await updateLuciusPostComment(commentId, parseLuciusPostCommentPatch(await request.json())));
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const { postId, commentId } = await ids(params);
    const existing = await getLuciusPostComment(commentId);
    if (!existing || existing.postId !== postId) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    return await deleteLuciusPostComment(commentId) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Comment not found" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
