import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseCatRoutine } from "@/lib/cats-validation";
import { createCatRoutine, listCatRoutines } from "@/lib/services/cat-routine";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const petId = params.get("petId");
    return NextResponse.json(await listCatRoutines({
      scope: params.get("scope") ?? undefined,
      petId: petId === "household" ? null : petId ? Number(petId) : undefined,
      enabledOnly: params.get("enabled") === "1",
    }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createCatRoutine(parseCatRoutine(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
