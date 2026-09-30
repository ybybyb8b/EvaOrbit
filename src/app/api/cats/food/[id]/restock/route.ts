import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { parseCatFoodRestock } from "@/lib/cat-food-validation";
import { configureCatFoodRestock } from "@/lib/services/cat-food";
export const runtime = "nodejs";
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await configureCatFoodRestock(parseId((await params).id), parseCatFoodRestock(await request.json()))); } catch (error) { return apiError(error); } }
