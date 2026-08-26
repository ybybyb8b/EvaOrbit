import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createAiProvider, listAiProviders } from "@/lib/services/evaorbit";
import { parseAiProvider } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(){try{return NextResponse.json(await listAiProviders(),{headers:{"Cache-Control":"no-store"}});}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createAiProvider(parseAiProvider(await request.json())),{status:201});}catch(error){return apiError(error);}}
