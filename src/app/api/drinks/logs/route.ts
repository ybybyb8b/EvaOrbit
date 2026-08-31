import { NextRequest,NextResponse } from "next/server";import{apiError}from"@/lib/api";import{createDrinkLog,listDrinkLogs}from"@/lib/services/drink";import{parseNewDrinkLog}from"@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await listDrinkLogs({date:p.get("date")||undefined,query:p.get("q")||undefined,drinkType:p.get("drinkType")||undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createDrinkLog(parseNewDrinkLog(await request.json())),{status:201});}catch(error){return apiError(error);}}
