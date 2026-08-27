import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parsePet } from "@/lib/cats-validation";
import { createPet,listPets } from "@/lib/services/cats";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{return NextResponse.json(await listPets(request.nextUrl.searchParams.get("all")==="1"));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createPet(parsePet(await request.json())),{status:201});}catch(error){return apiError(error);}}
