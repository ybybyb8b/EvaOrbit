import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|sw.js|icon.svg|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|ico)$).*)"],
};
