import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseCatRecord } from "@/lib/cats-validation";
import { createCatRecord } from "@/lib/services/cats";
export const runtime="nodejs";
export async function POST(request:NextRequest){try{const parsed=parseCatRecord(await request.json());return NextResponse.json(await createCatRecord(parsed.kind,parsed.record),{status:201});}catch(error){return apiError(error);}}
