import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { ValidationError } from "@/lib/validation";
import { searchFoodCatalog } from "@/lib/services/food-catalog";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const kind = params.get("kind");
    if (kind !== "food" && kind !== "drink") throw new ValidationError("请选择食品或饮品");
    const query = params.get("q") ?? "";
    if (query.length > 200) throw new ValidationError("搜索名称过长");
    return NextResponse.json(await searchFoodCatalog(kind, query, params.has("placeId") ? parseId(params.get("placeId")!) : undefined));
  } catch (error) { return apiError(error); }
}
