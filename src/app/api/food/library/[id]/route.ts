import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { removeFoodLibraryItem, updateFoodLibraryItem } from "@/lib/services/food";
import { parseFoodLibraryItem } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const item = await updateFoodLibraryItem(parseId((await params).id), parseFoodLibraryItem(await request.json()));
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Food Library item not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    const result = await removeFoodLibraryItem(parseId((await params).id));
    return result ? NextResponse.json(result) : NextResponse.json({ error: "Food Library item not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
