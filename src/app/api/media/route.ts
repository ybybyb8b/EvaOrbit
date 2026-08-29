import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMedia, listMedia } from "@/lib/services/media";
import { parseNewMedia, ValidationError } from "@/lib/validation";
import type { MediaType } from "@/lib/types";

export const runtime = "nodejs";

const mediaTypes = ["movie", "tv", "anime", "documentary", "other"] as const satisfies readonly MediaType[];

function optionalMediaType(value: string | null) {
  if (value === null || value.trim() === "") return undefined;
  if (!mediaTypes.includes(value as MediaType)) throw new ValidationError("Media 类型格式不正确");
  return value as MediaType;
}

function optionalLimit(value: string | null) {
  if (value === null || value.trim() === "") return undefined;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ValidationError("数量格式不正确");
  return limit;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    return NextResponse.json(await listMedia({
      query: params.get("q")?.trim() || undefined,
      mediaType: optionalMediaType(params.get("mediaType") ?? params.get("type")),
      limit: optionalLimit(params.get("limit")),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createMedia(parseNewMedia(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
