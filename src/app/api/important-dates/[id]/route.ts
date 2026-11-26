import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { listImportantDates, saveImportantDate, removeImportantDate } from "@/lib/services/important-dates";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_: NextRequest, { params }: Context) {
  try { const id=parseId((await params).id),item=(await listImportantDates()).find(item=>item.id===id);return item?NextResponse.json(item):NextResponse.json({error:"Important date not found"},{status:404}); } catch (error) { return apiError(error); }
}
// This editor sends a complete representation. PUT prevents accidental partial replacement.
export async function PUT(request: NextRequest, { params }: Context) {
  try { const item=await saveImportantDate(parseId((await params).id),await request.json());return item?NextResponse.json(item):NextResponse.json({error:"Important date not found"},{status:404}); } catch (error) { return apiError(error); }
}
export async function DELETE(_: NextRequest, { params }: Context) {
  try { return await removeImportantDate(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Important date not found"},{status:404}); } catch (error) { return apiError(error); }
}
