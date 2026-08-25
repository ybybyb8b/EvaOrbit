import { NextRequest,NextResponse } from "next/server";import{apiError}from"@/lib/api";import{checkDrinkLimits,createDrinkLimit,getDrinkLimits}from"@/lib/services/drink";import{parseDrinkLimit}from"@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{return NextResponse.json(request.nextUrl.searchParams.get("status")==="1"?await checkDrinkLimits():await getDrinkLimits());}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createDrinkLimit(parseDrinkLimit(await request.json())),{status:201});}catch(error){return apiError(error);}}
