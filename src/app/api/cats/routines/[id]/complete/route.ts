import { NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { completeCatRoutine } from "@/lib/services/cat-routine";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  try { const body = await request.json().catch(() => ({})); return NextResponse.json(await completeCatRoutine(parseId((await params).id), new Date(), body)); }
  catch (error) { return apiError(error); }
}
