import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { allowedEmail, supabaseConfig, usesSupabase } from "../config";

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "请先登录 EvaOrbit" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", destination);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  if (!usesSupabase()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email.toLocaleLowerCase() : "";
  const expectedEmail = allowedEmail();
  const authorized = Boolean(claims?.sub) && Boolean(expectedEmail) && email === expectedEmail;
  const isLogin = request.nextUrl.pathname === "/login";

  if (!authorized && !isLogin) return unauthorized(request);
  if (authorized && isLogin) return NextResponse.redirect(new URL("/", request.url));
  return response;
}
