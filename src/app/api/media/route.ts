import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMedia, listMedia } from "@/lib/services/media";
import { parseNewMedia, ValidationError } from "@/lib/validation";
import type { MediaRating, MediaStatus, MediaType } from "@/lib/types";

export const runtime = "nodejs";

const mediaTypes = ["movie", "tv", "anime", "documentary", "other"] as const satisfies readonly MediaType[];
const mediaStatuses = ["planned", "watching", "completed", "paused", "dropped"] as const satisfies readonly MediaStatus[];

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
function optionalStatus(value:string|null){if(!value)return undefined;if(!mediaStatuses.includes(value as MediaStatus))throw new ValidationError("Media 状态格式不正确");return value as MediaStatus;}
function optionalId(value:string|null){if(!value)return undefined;const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new ValidationError("Series 格式不正确");return id;}
function optionalBoolean(value:string|null){if(value===null||value==="")return undefined;if(value==="true")return true;if(value==="false")return false;throw new ValidationError("筛选格式不正确");}
function optionalRating(value:string|null){if(!value)return undefined;if(!/^(goat|dope|mid|nope|shit)[+-]?$/.test(value))throw new ValidationError("评分格式不正确");return value as MediaRating;}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    return NextResponse.json(await listMedia({
      query: params.get("q")?.trim() || undefined,
      mediaType: optionalMediaType(params.get("mediaType") ?? params.get("type")),
      status: optionalStatus(params.get("status")),
      rating: optionalRating(params.get("rating")),
      seriesId: optionalId(params.get("seriesId")),
      favorite: optionalBoolean(params.get("favorite")),
      rewatched: optionalBoolean(params.get("rewatched")),
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
