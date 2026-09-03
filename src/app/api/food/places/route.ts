import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createFoodPlace,listFoodPlaces } from "@/lib/services/food";
import { parseFoodPlace } from "@/lib/validation";
import type { FoodPlaceStatus } from "@/lib/types";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await listFoodPlaces(p.get("q")??"",{status:(p.get("status")||undefined) as FoodPlaceStatus|undefined,category:p.get("category")||undefined,limit:p.get("limit")?Number(p.get("limit")):undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createFoodPlace(parseFoodPlace(await request.json())),{status:201});}catch(error){return apiError(error);}}
