import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { parseCatFoodItemPatch } from "@/lib/cat-food-validation";
import { getCatFoodDetail, removeCatFoodItem, updateCatFoodItem } from "@/lib/services/cat-food";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) { try { const item = await getCatFoodDetail(parseId((await params).id)); return item ? NextResponse.json(item) : NextResponse.json({ error: "食品不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, { params }: Context) { try { const item = await updateCatFoodItem(parseId((await params).id), parseCatFoodItemPatch(await request.json())); return item ? NextResponse.json(item) : NextResponse.json({ error: "食品不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function DELETE(_: NextRequest, { params }: Context) { try { return (await removeCatFoodItem(parseId((await params).id))) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "食品不存在" }, { status: 404 }); } catch (error) { return apiError(error); } }
