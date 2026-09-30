import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { parseCatFoodPurchase } from "@/lib/cat-food-validation";
import { createCatFoodPurchase } from "@/lib/services/cat-food";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const id = parseId((await params).id); return NextResponse.json(await createCatFoodPurchase(parseCatFoodPurchase(await request.json(), id)), { status: 201 }); } catch (error) { return apiError(error); } }
