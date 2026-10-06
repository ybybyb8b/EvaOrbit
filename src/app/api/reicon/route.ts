import { apiError } from "@/lib/api";
import { reiconNames } from "@/lib/reicon-catalog";

export const runtime = "nodejs";
export async function GET() {
  try { return Response.json({ names: await reiconNames() }, { headers: { "Cache-Control": "private, max-age=3600" } }); }
  catch (error) { return apiError(error); }
}
