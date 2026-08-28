import { NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { skipCatRoutineOccurrence } from "@/lib/services/cat-routine";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(_: Request, { params }: Context) {
  try { return NextResponse.json(await skipCatRoutineOccurrence(parseId((await params).id))); }
  catch (error) { return apiError(error); }
}
