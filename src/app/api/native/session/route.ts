import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { allowedEmail, usesSupabase } from "@/lib/config";
import { HttpError } from "@/lib/errors";
import { parseNativeLoginCredentials } from "@/lib/native-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

function sessionResponse(authenticated: boolean, email?: string) {
  return NextResponse.json(
    { authenticated, ...(email ? { email } : {}) },
    { headers: noStoreHeaders },
  );
}

function noStoreError(error: unknown) {
  const response = apiError(error);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function currentAccount() {
  if (!usesSupabase()) return null;
  const expectedEmail = allowedEmail();
  if (!expectedEmail) throw new HttpError("服务器登录配置不可用", 503);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  if (error || !subject || email !== expectedEmail) return null;
  return email;
}

export async function GET() {
  try {
    const email = await currentAccount();
    return email ? sessionResponse(true, email) : sessionResponse(false);
  } catch (error) {
    return noStoreError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
      throw new ValidationError("登录请求必须使用 JSON");
    }
    if (!usesSupabase()) throw new HttpError("服务器登录配置不可用", 503);

    const credentials = parseNativeLoginCredentials(
      await request.json().catch(() => { throw new ValidationError("登录信息格式不正确"); }),
    );
    const expectedEmail = allowedEmail();
    if (!expectedEmail) throw new HttpError("服务器登录配置不可用", 503);
    if (credentials.email !== expectedEmail) throw new HttpError("邮箱或密码不正确", 401);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    const email = data.user?.email?.toLocaleLowerCase() ?? "";
    if (error || !data.user?.id || email !== expectedEmail) {
      await supabase.auth.signOut();
      throw new HttpError("邮箱或密码不正确", 401);
    }
    return sessionResponse(true, email);
  } catch (error) {
    return noStoreError(error);
  }
}

export async function DELETE() {
  try {
    if (usesSupabase()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    return new NextResponse(null, { status: 204, headers: noStoreHeaders });
  } catch (error) {
    return noStoreError(error);
  }
}
