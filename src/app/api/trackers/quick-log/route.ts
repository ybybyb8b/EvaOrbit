import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listQuickLogTrackers } from "@/lib/services/tracker";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await listQuickLogTrackers()); }
  catch (error) { return apiError(error); }
}
