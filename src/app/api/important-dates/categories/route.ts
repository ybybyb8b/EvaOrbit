import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listImportantDateCategories,saveImportantDateCategory } from "@/lib/services/important-dates";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await listImportantDateCategories()); } catch (error) { return apiError(error); }
}
export async function POST(request:NextRequest){try{return NextResponse.json(await saveImportantDateCategory(await request.json()));}catch(error){return apiError(error);}}
