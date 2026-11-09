import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { usesSupabase } from "@/lib/config";
import { allowsSqliteLocalRequest } from "@/lib/sqlite-local-access";

export async function proxy(request: NextRequest) {
  if (!usesSupabase()) {
    // The launcher binds the TCP listener; header checks alone cannot prove a local peer.
    if (!allowsSqliteLocalRequest(request.headers, process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.EVAORBIT_SQLITE_LOOPBACK_LAUNCHER === "1")) {
      return NextResponse.json({ error: "SQLite is available only via the loopback development launcher." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.next({ request });
  }
  if (request.nextUrl.pathname === "/theme-init.js" || request.nextUrl.pathname === "/api/mcp" || request.nextUrl.pathname === "/.well-known/oauth-protected-resource" || request.nextUrl.pathname === "/api/reminders/deliver" || request.nextUrl.pathname === "/api/hermes/notify" || request.nextUrl.pathname === "/api/healthkit/energy/ingest" || request.nextUrl.pathname === "/api/native/session") {
    return NextResponse.next({ request });
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|manifest.webmanifest|sw.js|icon.svg|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|ico)$).*)"],
};
