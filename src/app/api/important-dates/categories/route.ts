import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listImportantDateCategories } from "@/lib/services/important-dates";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await listImportantDateCategories()); } catch (error) { return apiError(error); }
}
