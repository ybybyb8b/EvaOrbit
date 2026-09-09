import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { currentNativeAccount } from "@/lib/native-account";
import { parseNativeSyncRequest } from "@/lib/native-sync-contract";
import { synchronizeNativeTrackers } from "@/lib/native-sync-service";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) throw new ValidationError("同步请求必须使用 JSON");
    const account = await currentNativeAccount();
    if (!account) throw new HttpError("登录已失效", 401);
    const body = await request.json().catch(() => { throw new ValidationError("同步请求格式不正确"); });
    return NextResponse.json(await synchronizeNativeTrackers(account.id, parseNativeSyncRequest(body)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
