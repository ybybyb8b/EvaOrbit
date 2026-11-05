import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { supabaseConfig, usesSupabase } from "@/lib/config";
import { ConflictError, HttpError } from "@/lib/errors";
import { hermesInput, hermesRead } from "@/lib/hermes";
import { currentNativeAccount } from "@/lib/native-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function client() {
  if (!usesSupabase()) throw new HttpError("Hermes 需要连接 Supabase 账户。", 503);
  if (!await currentNativeAccount()) throw new HttpError("请先登录 EvaOrbit。", 401);
  return createSupabaseServerClient();
}
async function command(action: string, data: object) {
  const supabase = await client();
  const result = await supabase.rpc(action === "activity" || action === "seen" ? "eo_hermes_activity" : "eo_hermes", { p_action: action === "activity" ? "read" : action, p_data: data });
  if (result.error) {
    if (result.error.message.includes("HERMES_PROMPT_EXPIRED")) throw new ConflictError("这个提问已结束，请刷新后重新发消息给 Hermes。");
    if (result.error.message.includes("HERMES_BUSY")) throw new ConflictError("Hermes 正在处理这段对话，结束后再清理。");
    if (result.error.message.includes("HERMES_")) throw new ConflictError("消息或会话状态已变化，请刷新后重试。");
    throw new HttpError("Hermes 消息服务暂不可用，请检查数据库迁移和连接。", 503);
  }
  return result.data;
}
function failure(error: unknown) { const response = apiError(error); response.headers.set("Cache-Control", "no-store"); return response; }
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "activity") {
      const receiptId = params.get("receiptId");
      if (receiptId && !hermesRead.safeParse({ pending: [receiptId] }).success) throw new ValidationError("消息 ID 格式不正确。");
      return NextResponse.json(await command("activity", receiptId ? { receiptId } : {}), { headers });
    }
    const parsed = hermesRead.safeParse({ ...Object.fromEntries(params), pending: params.get("pending")?.split(",").filter(Boolean) ?? [] });
    if (!parsed.success) throw new ValidationError("消息查询格式不正确。");
    return NextResponse.json(await command("read", parsed.data), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const parsed = hermesInput.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("消息或操作格式不正确。");
    const { action, ...data } = parsed.data;
    if (action === "pair") {
      const token = `eo_${randomBytes(32).toString("base64url")}`;
      const pairing = await command("pair", { hash: createHash("sha256").update(token).digest("hex") });
      const { url, publishableKey: key } = supabaseConfig();
      return NextResponse.json({ url, key, token, userId: pairing.userId }, { headers });
    }
    return NextResponse.json(await command(action, data), { headers });
  } catch (error) { return failure(error); }
}
