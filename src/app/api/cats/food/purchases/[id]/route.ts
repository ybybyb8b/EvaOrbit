import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { parseCatFoodPurchasePatch } from "@/lib/cat-food-validation";
import { deleteCatFoodPurchase, updateCatFoodPurchase } from "@/lib/services/cat-food";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, { params }: Context) { try { const item = await updateCatFoodPurchase(parseId((await params).id), parseCatFoodPurchasePatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "购买记录不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function DELETE(_: NextRequest, { params }: Context) { try { return (await deleteCatFoodPurchase(parseId((await params).id))) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "购买记录不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
