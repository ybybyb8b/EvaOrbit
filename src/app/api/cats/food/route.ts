import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseCatFoodItem } from "@/lib/cat-food-validation";
import { createCatFoodItem, listCatFood } from "@/lib/services/cat-food";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { return NextResponse.json(await listCatFood(request.nextUrl.searchParams.get("q") ?? "")); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await createCatFoodItem(parseCatFoodItem(await request.json())), { status: 201 }); } catch (error) { return apiError(error); } }
