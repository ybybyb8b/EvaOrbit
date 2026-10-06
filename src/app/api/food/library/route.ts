import { NextRequest,NextResponse } from "next/server";import{apiError,parseId}from"@/lib/api";import{searchFoodLibraryForPlace,upsertFoodLibraryItem}from"@/lib/services/food";import{parseFoodLibraryItem}from"@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await searchFoodLibraryForPlace(p.get("q")||"",p.get("brand")||"",p.has("placeId")?parseId(p.get("placeId")!):undefined));}catch(error){return apiError(error);}}
export async function PUT(request:NextRequest){try{return NextResponse.json(await upsertFoodLibraryItem(parseFoodLibraryItem(await request.json())));}catch(error){return apiError(error);}}
