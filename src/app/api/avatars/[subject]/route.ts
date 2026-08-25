import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { readAvatar, resetAvatar, saveAvatar, type AvatarSubject } from "@/lib/services/avatar";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ subject: string }> };

async function subject(context: Context): Promise<AvatarSubject> {
  const value = (await context.params).subject;
  if (value !== "user" && value !== "assistant") throw new ValidationError("头像身份不存在");
  return value;
}

export async function GET(_: NextRequest, context: Context) {
  try {
    const avatar = await readAvatar(await subject(context));
    if (!avatar) return new NextResponse(null, { status: 404 });
    return new NextResponse(avatar.bytes, { headers: { "Content-Type": avatar.mime, "Content-Length": String(avatar.bytes.byteLength), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new ValidationError("请选择头像图片");
    const settings = await saveAvatar(await subject(context), file);
    return NextResponse.json({ avatarType: "image", avatarValue: (await subject(context)) === "user" ? settings.userAvatarValue : settings.assistantAvatarValue, updatedAt: settings.updatedAt });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: NextRequest, context: Context) {
  try { await resetAvatar(await subject(context)); return new NextResponse(null, { status: 204 }); }
  catch (error) { return apiError(error); }
}
