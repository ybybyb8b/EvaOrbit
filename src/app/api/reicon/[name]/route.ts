import { apiError } from "@/lib/api";
import { reiconSvg } from "@/lib/reicon-catalog";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const svg = await reiconSvg((await params).name);
    if (!svg) return new Response("Icon not found", { status: 404 });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return apiError(error); }
}
