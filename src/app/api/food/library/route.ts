import { NextRequest,NextResponse } from "next/server";import{apiError}from"@/lib/api";import{searchFoodLibrary,upsertFoodLibraryItem}from"@/lib/services/food";import{parseFoodLibraryItem}from"@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await searchFoodLibrary(p.get("q")||"",p.get("brand")||""));}catch(error){return apiError(error);}}
export async function PUT(request:NextRequest){try{return NextResponse.json(await upsertFoodLibraryItem(parseFoodLibraryItem(await request.json())));}catch(error){return apiError(error);}}
