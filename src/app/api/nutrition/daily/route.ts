import { NextRequest,NextResponse } from "next/server";import{apiError}from"@/lib/api";import{getDailyNutritionSummary,updateDailyEnergy}from"@/lib/services/nutrition";import{parseDailyEnergy}from"@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{return NextResponse.json(await getDailyNutritionSummary(request.nextUrl.searchParams.get("date")||undefined));}catch(error){return apiError(error);}}
export async function PUT(request:NextRequest){try{const{date,...input}=parseDailyEnergy(await request.json());return NextResponse.json(await updateDailyEnergy(date,input));}catch(error){return apiError(error);}}
